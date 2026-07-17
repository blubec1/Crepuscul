using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;

namespace Backend.Controllers;

[ApiController]
[Route("api/breathing")]
[Authorize]
public class BreathingController : ControllerBase
{
    private readonly AppDbContext _db;

    public BreathingController(AppDbContext db)
    {
        _db = db;
    }

    public class LogSessionRequest
    {
        public int DurationSeconds { get; set; }
    }

    public class SessionResponse
    {
        public int Id { get; set; }
        public int DurationSeconds { get; set; }
        public DateTime CompletedAt { get; set; }
    }

    public class BreathingStats
    {
        public int TotalSessions { get; set; }
        public int TotalMinutes { get; set; }
        public int CurrentStreak { get; set; }
        public int LongestStreak { get; set; }
    }

    [HttpPost("log")]
    public async Task<IActionResult> LogSession([FromBody] LogSessionRequest request)
    {
        if (request.DurationSeconds <= 0)
            return BadRequest(new { message = "Duration must be greater than 0" });

        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var session = new BreathingSession
        {
            UserId = userId,
            DurationSeconds = request.DurationSeconds,
            CompletedAt = DateTime.UtcNow
        };

        _db.BreathingSessions.Add(session);
        await _db.SaveChangesAsync();

        return Ok(new SessionResponse
        {
            Id = session.Id,
            DurationSeconds = session.DurationSeconds,
            CompletedAt = session.CompletedAt
        });
    }

    [HttpGet("sessions")]
    public async Task<IActionResult> GetMySessions()
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var sessions = await _db.BreathingSessions
            .Where(s => s.UserId == userId)
            .OrderByDescending(s => s.CompletedAt)
            .Take(50)
            .Select(s => new SessionResponse
            {
                Id = s.Id,
                DurationSeconds = s.DurationSeconds,
                CompletedAt = s.CompletedAt
            })
            .ToListAsync();

        return Ok(sessions);
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetMyStats()
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var sessions = await _db.BreathingSessions
            .Where(s => s.UserId == userId)
            .OrderByDescending(s => s.CompletedAt)
            .ToListAsync();

        var totalSessions = sessions.Count;
        var totalMinutes = (int)(sessions.Sum(s => s.DurationSeconds) / 60);

        // Calculate streaks (consecutive days with at least one session)
        var sessionDays = sessions
            .Select(s => s.CompletedAt.Date)
            .Distinct()
            .OrderByDescending(d => d)
            .ToList();

        int currentStreak = 0;
        int longestStreak = 0;
        int tempStreak = 0;
        var today = DateTime.UtcNow.Date;

        for (int i = 0; i < sessionDays.Count; i++)
        {
            if (i == 0 && sessionDays[i] == today)
            {
                tempStreak = 1;
            }
            else if (i > 0 && sessionDays[i - 1] - sessionDays[i] == TimeSpan.FromDays(1))
            {
                tempStreak++;
            }
            else
            {
                if (tempStreak > longestStreak)
                    longestStreak = tempStreak;
                tempStreak = 1;
            }
        }
        if (tempStreak > longestStreak)
            longestStreak = tempStreak;
        currentStreak = (sessionDays.Count > 0 && (today - sessionDays[0]).TotalDays <= 1) ? tempStreak : 0;

        return Ok(new BreathingStats
        {
            TotalSessions = totalSessions,
            TotalMinutes = totalMinutes,
            CurrentStreak = currentStreak,
            LongestStreak = longestStreak
        });
    }
}
