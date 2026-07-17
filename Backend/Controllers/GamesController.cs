using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;

namespace Backend.Controllers;

[ApiController]
[Route("api/games")]
public class GamesController : ControllerBase
{
    private readonly AppDbContext _db;

    public GamesController(AppDbContext db)
    {
        _db = db;
    }

    public class ScoreRequest
    {
        public string GameName { get; set; } = string.Empty;
        public int Points { get; set; }
    }

    public class ScoreResponse
    {
        public int Id { get; set; }
        public string GameName { get; set; } = string.Empty;
        public int Points { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class LeaderboardEntry
    {
        public int UserId { get; set; }
        public string Username { get; set; } = string.Empty;
        public int TotalPoints { get; set; }
        public int GamesPlayed { get; set; }
    }

    [HttpGet("leaderboard")]
    public async Task<IActionResult> GetLeaderboard()
    {
        var leaderboard = await _db.Scores
            .Include(s => s.User)
            .GroupBy(s => s.UserId)
            .Select(g => new LeaderboardEntry
            {
                UserId = g.Key,
                Username = g.First().User!.Username,
                TotalPoints = g.Sum(s => s.Points),
                GamesPlayed = g.Count()
            })
            .OrderByDescending(e => e.TotalPoints)
            .Take(20)
            .ToListAsync();

        return Ok(leaderboard);
    }

    [HttpGet("leaderboard/{gameName}")]
    public async Task<IActionResult> GetLeaderboardByGame(string gameName)
    {
        var leaderboard = await _db.Scores
            .Include(s => s.User)
            .Where(s => s.GameName == gameName)
            .GroupBy(s => s.UserId)
            .Select(g => new LeaderboardEntry
            {
                UserId = g.Key,
                Username = g.First().User!.Username,
                TotalPoints = g.Sum(s => s.Points),
                GamesPlayed = g.Count()
            })
            .OrderByDescending(e => e.TotalPoints)
            .Take(20)
            .ToListAsync();

        return Ok(leaderboard);
    }

    [HttpPost("scores")]
    [Authorize]
    public async Task<IActionResult> SubmitScore([FromBody] ScoreRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.GameName))
            return BadRequest(new { message = "Game name is required" });

        if (request.Points < 0)
            return BadRequest(new { message = "Points cannot be negative" });

        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var score = new Score
        {
            UserId = userId,
            GameName = request.GameName,
            Points = request.Points,
            CreatedAt = DateTime.UtcNow
        };

        _db.Scores.Add(score);
        await _db.SaveChangesAsync();

        return Ok(new ScoreResponse
        {
            Id = score.Id,
            GameName = score.GameName,
            Points = score.Points,
            CreatedAt = score.CreatedAt
        });
    }

    [HttpGet("my-scores")]
    [Authorize]
    public async Task<IActionResult> GetMyScores()
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var scores = await _db.Scores
            .Where(s => s.UserId == userId)
            .OrderByDescending(s => s.CreatedAt)
            .Take(50)
            .Select(s => new ScoreResponse
            {
                Id = s.Id,
                GameName = s.GameName,
                Points = s.Points,
                CreatedAt = s.CreatedAt
            })
            .ToListAsync();

        return Ok(scores);
    }
}
