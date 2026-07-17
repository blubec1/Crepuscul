using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Afterglow.Api.Data;
using Afterglow.Api.Hubs;
using Afterglow.Api.Models;

namespace Afterglow.Api.Controllers;

[ApiController]
[Route("api/buddy")]
public class BuddyController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IHubContext<BuddyChatHub> _buddyHub;

    public BuddyController(AppDbContext db, IHubContext<BuddyChatHub> buddyHub)
    {
        _db = db;
        _buddyHub = buddyHub;
    }

    [HttpPost("queue")]
    public async Task<IActionResult> JoinQueue([FromBody] SessionRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.SessionId))
            return BadRequest(new { error = "SessionId is required" });

        var mySession = await _db.CheckInSessions
            .Where(s => s.SessionId == request.SessionId)
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync();

        if (mySession == null)
            return BadRequest(new { error = "No check-in found. Complete a check-in first." });

        var existing = await _db.BuddyQueues
            .FirstOrDefaultAsync(q => q.SessionId == request.SessionId && q.IsActive);

        if (existing != null)
            return Ok(new { queued = true, message = "Already in queue" });

        var existingMatch = await _db.BuddyMatches
            .FirstOrDefaultAsync(m => m.IsActive && (m.SessionId1 == request.SessionId || m.SessionId2 == request.SessionId));

        if (existingMatch != null)
            return Ok(new { queued = false, matched = true, matchId = existingMatch.Id, matchScore = existingMatch.MatchScore });

        var entry = new BuddyQueue
        {
            SessionId = request.SessionId,
            QueuedAt = DateTime.UtcNow,
            IsActive = true
        };

        _db.BuddyQueues.Add(entry);
        await _db.SaveChangesAsync();

        var matchResult = await TryCreateMatch(request.SessionId);
        if (matchResult != null)
            return Ok(matchResult);

        return Ok(new { queued = true, message = "Searching for a buddy..." });
    }

    [HttpDelete("queue")]
    public async Task<IActionResult> LeaveQueue([FromBody] SessionRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.SessionId))
            return BadRequest(new { error = "SessionId is required" });

        var entries = await _db.BuddyQueues
            .Where(q => q.SessionId == request.SessionId && q.IsActive)
            .ToListAsync();

        foreach (var entry in entries)
            entry.IsActive = false;

        await _db.SaveChangesAsync();

        return Ok(new { queued = false, message = "Left the queue" });
    }

    [HttpPost("queue/check")]
    public async Task<IActionResult> CheckMatch([FromBody] SessionRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.SessionId))
            return BadRequest(new { error = "SessionId is required" });

        var match = await _db.BuddyMatches
            .FirstOrDefaultAsync(m => m.IsActive && (m.SessionId1 == request.SessionId || m.SessionId2 == request.SessionId));

        if (match != null)
            return Ok(new { matched = true, queued = false, matchId = match.Id, matchScore = match.MatchScore });

        var entry = await _db.BuddyQueues
            .FirstOrDefaultAsync(q => q.SessionId == request.SessionId && q.IsActive);

        if (entry != null)
            return Ok(new { matched = false, queued = true });

        return Ok(new { matched = false, queued = false, message = "Not in queue" });
    }

    [HttpGet("queue/status")]
    public async Task<IActionResult> GetQueueStatus([FromQuery] string sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
            return BadRequest(new { error = "sessionId query parameter is required" });

        var entry = await _db.BuddyQueues
            .FirstOrDefaultAsync(q => q.SessionId == sessionId && q.IsActive);

        if (entry == null)
            return Ok(new { queued = false });

        var queueCount = await _db.BuddyQueues.CountAsync(q => q.IsActive);

        return Ok(new
        {
            queued = true,
            queuedAt = entry.QueuedAt,
            queueSize = queueCount
        });
    }

    [HttpGet("match/active")]
    public async Task<IActionResult> GetActiveMatch([FromQuery] string sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
            return BadRequest(new { error = "sessionId query parameter is required" });

        var match = await _db.BuddyMatches
            .FirstOrDefaultAsync(m => m.IsActive && (m.SessionId1 == sessionId || m.SessionId2 == sessionId));

        if (match == null)
            return Ok(new { matched = false });

        return Ok(new
        {
            matched = true,
            matchId = match.Id,
            matchScore = match.MatchScore,
            partnerSessionId = match.SessionId1 == sessionId ? match.SessionId2 : match.SessionId1
        });
    }

    [HttpPost("match/end")]
    public async Task<IActionResult> EndMatch([FromBody] SessionRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.SessionId))
            return BadRequest(new { error = "SessionId is required" });

        var match = await _db.BuddyMatches
            .FirstOrDefaultAsync(m => m.IsActive && (m.SessionId1 == request.SessionId || m.SessionId2 == request.SessionId));

        if (match == null)
            return Ok(new { ended = false, message = "No active match found" });

        var partnerSessionId = match.SessionId1 == request.SessionId ? match.SessionId2 : match.SessionId1;

        match.IsActive = false;

        var queueEntries = await _db.BuddyQueues
            .Where(q => q.IsActive && (q.SessionId == request.SessionId || q.SessionId == partnerSessionId))
            .ToListAsync();

        foreach (var entry in queueEntries)
            entry.IsActive = false;

        await _db.SaveChangesAsync();

        await _buddyHub.Clients.Group($"buddy-{match.Id}").SendAsync("MatchEnded", match.Id, partnerSessionId);

        return Ok(new
        {
            ended = true,
            matchId = match.Id,
            partnerSessionId
        });
    }

    [HttpGet("messages/{matchId}")]
    public async Task<IActionResult> GetMessages(int matchId)
    {
        var messages = await _db.BuddyMessages
            .Where(m => m.BuddyMatchId == matchId)
            .OrderBy(m => m.SentAt)
            .Select(m => new { m.SenderSessionId, m.Text, m.SentAt })
            .ToListAsync();

        return Ok(messages);
    }

    private async Task<object?> TryCreateMatch(string sessionId)
    {
        var mySession = await _db.CheckInSessions
            .Where(s => s.SessionId == sessionId)
            .OrderByDescending(s => s.CreatedAt)
            .Include(s => s.Answers)
            .FirstOrDefaultAsync();

        if (mySession == null) return null;

        var myAnswerDict = mySession.Answers.ToDictionary(a => a.CheckInQuestionId, a => a.Value);

        var matchedSessionIds = await _db.BuddyMatches
            .Where(m => m.IsActive)
            .Select(m => m.SessionId1)
            .Union(_db.BuddyMatches.Where(m => m.IsActive).Select(m => m.SessionId2))
            .Distinct()
            .ToListAsync();

        var availableEntries = await _db.BuddyQueues
            .Where(q => q.IsActive && q.SessionId != sessionId && !matchedSessionIds.Contains(q.SessionId))
            .ToListAsync();

        if (availableEntries.Count == 0) return null;

        var candidateIds = availableEntries.Select(q => q.SessionId).ToList();

        var candidateSessions = await _db.CheckInSessions
            .Where(s => candidateIds.Contains(s.SessionId))
            .Include(s => s.Answers)
            .ToListAsync();

        var latestBySession = candidateSessions
            .GroupBy(s => s.SessionId)
            .Select(g => g.OrderByDescending(s => s.CreatedAt).First())
            .ToList();

        string? bestCandidateId = null;
        double bestScore = double.MaxValue;

        foreach (var candidate in latestBySession)
        {
            var candidateDict = candidate.Answers.ToDictionary(a => a.CheckInQuestionId, a => a.Value);
            double totalDiff = 0;
            int commonQuestions = 0;

            foreach (var kvp in myAnswerDict)
            {
                if (candidateDict.TryGetValue(kvp.Key, out int candidateValue))
                {
                    totalDiff += Math.Abs(kvp.Value - candidateValue);
                    commonQuestions++;
                }
            }

            if (commonQuestions == 0) continue;

            double avgDiff = totalDiff / commonQuestions;
            if (avgDiff < bestScore)
            {
                bestScore = avgDiff;
                bestCandidateId = candidate.SessionId;
            }
        }

        if (bestCandidateId == null) return null;

        var sid1 = string.Compare(sessionId, bestCandidateId, StringComparison.Ordinal) <= 0
            ? sessionId : bestCandidateId;
        var sid2 = string.Compare(sessionId, bestCandidateId, StringComparison.Ordinal) <= 0
            ? bestCandidateId : sessionId;

        var now = DateTime.UtcNow;
        var rowsAffected = await _db.Database.ExecuteSqlRawAsync(@"
            INSERT INTO ""BuddyMatches"" (""SessionId1"", ""SessionId2"", ""MatchScore"", ""IsActive"", ""CreatedAt"")
            SELECT {0}, {1}, {2}, 1, {3}
            WHERE NOT EXISTS (
                SELECT 1 FROM ""BuddyMatches""
                WHERE ""IsActive"" = 1
                AND (""SessionId1"" = {0} OR ""SessionId2"" = {0}
                  OR ""SessionId1"" = {1} OR ""SessionId2"" = {1})
            )", sid1, sid2, bestScore, now);

        if (rowsAffected > 0)
        {
            var match = await _db.BuddyMatches
                .FirstOrDefaultAsync(m => m.SessionId1 == sid1 && m.SessionId2 == sid2 && m.IsActive);

            var myEntry = await _db.BuddyQueues.FirstOrDefaultAsync(q => q.SessionId == sessionId && q.IsActive);
            if (myEntry != null) myEntry.IsActive = false;

            var otherEntry = await _db.BuddyQueues.FirstOrDefaultAsync(q => q.SessionId == bestCandidateId && q.IsActive);
            if (otherEntry != null) otherEntry.IsActive = false;

            await _db.SaveChangesAsync();

            return new { queued = false, matched = true, matchId = match!.Id, matchScore = bestScore };
        }

        return null;
    }

    public record SessionRequest(string SessionId);
}
