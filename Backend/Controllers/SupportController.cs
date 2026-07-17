using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Afterglow.Api.Data;
using Afterglow.Api.Models;

namespace Afterglow.Api.Controllers;

[ApiController]
[Route("api/support")]
public class SupportController : ControllerBase
{
    private readonly AppDbContext _db;

    public SupportController(AppDbContext db) => _db = db;

    [HttpGet("messages")]
    public async Task<IActionResult> GetMessages()
    {
        var messages = await _db.Messages
            .OrderByDescending(m => m.CreatedAt)
            .Take(50)
            .Select(m => new { m.Id, m.Content, m.CreatedAt })
            .ToListAsync();
        return Ok(messages);
    }

    [HttpPost("messages")]
    public async Task<IActionResult> SendMessage([FromBody] MessageRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Content))
            return BadRequest(new { error = "Message cannot be empty" });

        if (request.Content.Length > 500)
            return BadRequest(new { error = "Message must be 500 characters or less" });

        var message = new Message
        {
            Content = request.Content.Trim(),
            CreatedAt = DateTime.UtcNow
        };

        _db.Messages.Add(message);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetMessages), new
        {
            id = message.Id,
            content = message.Content
        });
    }

    public record MessageRequest(string Content);
}
