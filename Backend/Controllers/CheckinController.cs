using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Afterglow.Api.Data;
using Afterglow.Api.Hubs;
using Afterglow.Api.Models;

namespace Afterglow.Api.Controllers;

[ApiController]
[Route("api/checkin")]
public class CheckinController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IHubContext<BuddyChatHub> _buddyHub;

    public CheckinController(AppDbContext db, IHubContext<BuddyChatHub> buddyHub)
    {
        _db = db;
        _buddyHub = buddyHub;
    }

    [HttpGet("questions")]
    public async Task<IActionResult> GetQuestions()
    {
        var questions = await _db.CheckInQuestions
            .Where(q => q.IsActive)
            .OrderBy(q => q.Order)
            .Select(q => new { q.Id, q.Text, q.Type, q.Order })
            .ToListAsync();
        return Ok(questions);
    }

    [HttpPost]
    public async Task<IActionResult> SubmitCheckIn([FromBody] SubmitCheckInRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.SessionId))
            return BadRequest(new { error = "SessionId is required" });

        if (request.Answers == null || request.Answers.Count == 0)
            return BadRequest(new { error = "At least one answer is required" });

        var validQuestionIds = await _db.CheckInQuestions
            .Where(q => q.IsActive)
            .Select(q => q.Id)
            .ToListAsync();

        var session = new CheckInSession
        {
            SessionId = request.SessionId,
            CreatedAt = DateTime.UtcNow,
            Answers = request.Answers
                .Where(a => validQuestionIds.Contains(a.QuestionId))
                .Select(a => new CheckInAnswer
                {
                    CheckInQuestionId = a.QuestionId,
                    Value = a.Value
                })
                .ToList()
        };

        _db.CheckInSessions.Add(session);
        await _db.SaveChangesAsync();

        var activeMatch = await _db.BuddyMatches
            .FirstOrDefaultAsync(m => m.IsActive && (m.SessionId1 == request.SessionId || m.SessionId2 == request.SessionId));

        if (activeMatch != null)
        {
            var partnerSessionId = activeMatch.SessionId1 == request.SessionId ? activeMatch.SessionId2 : activeMatch.SessionId1;

            activeMatch.IsActive = false;

            var queueEntries = await _db.BuddyQueues
                .Where(q => q.IsActive && (q.SessionId == request.SessionId || q.SessionId == partnerSessionId))
                .ToListAsync();

            foreach (var entry in queueEntries)
                entry.IsActive = false;

            await _db.SaveChangesAsync();

            await _buddyHub.Clients.Group($"buddy-{activeMatch.Id}").SendAsync("MatchEnded", activeMatch.Id, partnerSessionId);
        }

        return Ok(new
        {
            sessionId = session.Id,
            answers = session.Answers.Select(a => new
            {
                questionId = a.CheckInQuestionId,
                value = a.Value
            }),
            createdAt = session.CreatedAt
        });
    }

    [HttpGet("latest")]
    public async Task<IActionResult> GetLatest([FromQuery] string sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
            return BadRequest(new { error = "sessionId query parameter is required" });

        var session = await _db.CheckInSessions
            .Where(s => s.SessionId == sessionId)
            .OrderByDescending(s => s.CreatedAt)
            .Include(s => s.Answers)
            .FirstOrDefaultAsync();

        if (session == null)
            return Ok(new { found = false });

        return Ok(new
        {
            found = true,
            sessionId = session.Id,
            answers = session.Answers.Select(a => new
            {
                questionId = a.CheckInQuestionId,
                value = a.Value
            }),
            createdAt = session.CreatedAt
        });
    }

    [HttpGet("recommendations")]
    public async Task<IActionResult> GetRecommendations([FromQuery] string sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
            return BadRequest(new { error = "sessionId query parameter is required" });

        var session = await _db.CheckInSessions
            .Where(s => s.SessionId == sessionId)
            .OrderByDescending(s => s.CreatedAt)
            .Include(s => s.Answers)
            .FirstOrDefaultAsync();

        if (session == null)
            return Ok(new { features = new[] { "chat", "exercises" } });

        var features = new List<string>();
        features.Add("chat");
        features.Add("exercises");

        foreach (var answer in session.Answers)
        {
            var question = await _db.CheckInQuestions.FindAsync(answer.CheckInQuestionId);
            if (question == null) continue;

            if (answer.Value <= 2)
            {
                if (!features.Contains("sounds")) features.Add("sounds");
                if (!features.Contains("games")) features.Add("games");
            }
            if (answer.Value >= 4)
            {
                if (!features.Contains("journal")) features.Add("journal");
            }
        }

        return Ok(new { features });
    }

    public record AnswerDto(int QuestionId, int Value);
    public record SubmitCheckInRequest(string SessionId, List<AnswerDto>? Answers);
}
