using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Afterglow.Api.Data;
using Afterglow.Api.Models;

namespace Afterglow.Api.Controllers;

[ApiController]
[Route("api/hotlines")]
public class HotlineController : ControllerBase
{
    private readonly AppDbContext _db;

    public HotlineController(AppDbContext db) => _db = db;

    [HttpGet("{region}")]
    public async Task<IActionResult> GetByRegion(string region)
    {
        var hotlines = await _db.CrisisHotlines
            .Where(h => h.RegionCode == region || h.RegionCode == "DEFAULT")
            .OrderByDescending(h => h.IsEmergency)
            .Select(h => new { h.Name, h.Number, h.Type, h.Prefix, h.IsEmergency })
            .ToListAsync();

        return Ok(hotlines);
    }
}
