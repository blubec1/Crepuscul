using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Crepuscul.Api.Data;
using Crepuscul.Api.Models;

namespace Crepuscul.Api.Controllers;

[ApiController]
[Route("api/checkins")]
public class CheckinsController : ControllerBase
{
    private readonly AppDbContext _db;

    public CheckinsController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var checkins = await _db.CheckIns
            .OrderByDescending(c => c.CreatedAt)
            .Take(50)
            .Select(c => new { c.Id, c.Mood, c.Note, c.CreatedAt })
            .ToListAsync();
        return Ok(checkins);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CheckInRequest request)
    {
        if (request.Mood < 1 || request.Mood > 5)
            return BadRequest(new { error = "Mood must be between 1 and 5" });

        var checkin = new CheckIn
        {
            Mood = request.Mood,
            Note = request.Note ?? "",
            CreatedAt = DateTime.UtcNow
        };

        _db.CheckIns.Add(checkin);
        await _db.SaveChangesAsync();

        var exercise = await _db.Exercises
            .Where(e => e.MoodType == "any")
            .OrderBy(_ => EF.Functions.Random())
            .FirstOrDefaultAsync();

        return CreatedAtAction(nameof(GetAll), new
        {
            id = checkin.Id,
            mood = checkin.Mood,
            note = checkin.Note,
            exercise
        });
    }

    public record CheckInRequest(int Mood, string? Note);
}
