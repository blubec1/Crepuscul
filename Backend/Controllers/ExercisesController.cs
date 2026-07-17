using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Crepuscul.Api.Data;
using Crepuscul.Api.Models;

namespace Crepuscul.Api.Controllers;

[ApiController]
[Route("api/exercises")]
public class ExercisesController : ControllerBase
{
    private readonly AppDbContext _db;

    public ExercisesController(AppDbContext db) => _db = db;

    private static readonly Dictionary<int, string[]> MoodMap = new()
    {
        { 1, new[] { "anxiety", "any" } },
        { 2, new[] { "anxiety", "any" } },
        { 3, new[] { "low", "any" } },
        { 4, new[] { "loneliness", "any" } },
        { 5, new[] { "insomnia", "any" } }
    };

    [HttpGet("{mood:int}")]
    public async Task<IActionResult> GetByMood(int mood)
    {
        if (mood < 1 || mood > 5)
            return BadRequest(new { error = "Mood must be between 1 and 5" });

        var types = MoodMap[mood];

        var exercises = await _db.Exercises
            .Where(e => types.Contains(e.MoodType))
            .OrderBy(_ => EF.Functions.Random())
            .Take(3)
            .ToListAsync();

        return Ok(exercises);
    }
}
