using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Afterglow.Api.Data;
using Afterglow.Api.Models;

namespace Afterglow.Api.Controllers;

[ApiController]
[Route("api/penpal")]
[Authorize]
public class PenPalController : ControllerBase
{
    private readonly AppDbContext _db;

    public PenPalController(AppDbContext db) => _db = db;

    private string GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    private async Task<PenPalProfile> EnsureProfile(string userId)
    {
        var profile = await _db.PenPalProfiles.FirstOrDefaultAsync(p => p.UserId == userId);
        if (profile != null) return profile;

        var alias = "Anon_" + Guid.NewGuid().ToString("N")[..8];
        while (await _db.PenPalProfiles.AnyAsync(p => p.Alias == alias))
            alias = "Anon_" + Guid.NewGuid().ToString("N")[..8];

        profile = new PenPalProfile { UserId = userId, Alias = alias, CreatedAt = DateTime.UtcNow };
        _db.PenPalProfiles.Add(profile);
        await _db.SaveChangesAsync();
        return profile;
    }

    [HttpPost("profile")]
    public async Task<IActionResult> CreateOrUpdateProfile([FromBody] AliasRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Alias))
            return BadRequest(new { error = "Alias is required" });

        if (request.Alias.Length < 2 || request.Alias.Length > 30)
            return BadRequest(new { error = "Alias must be 2-30 characters" });

        var alias = request.Alias.Trim();

        var userId = GetUserId();
        var existing = await _db.PenPalProfiles.FirstOrDefaultAsync(p => p.UserId == userId);
        if (existing != null)
        {
            if (existing.Alias == alias)
                return Ok(new { alias = existing.Alias });

            var taken = await _db.PenPalProfiles.AnyAsync(p => p.Alias == alias && p.UserId != userId);
            if (taken)
                return Conflict(new { error = "Alias already taken" });

            existing.Alias = alias;
            await _db.SaveChangesAsync();
            return Ok(new { alias });
        }

        var aliasTaken = await _db.PenPalProfiles.AnyAsync(p => p.Alias == alias);
        if (aliasTaken)
            return Conflict(new { error = "Alias already taken" });

        var profile = new PenPalProfile
        {
            UserId = userId,
            Alias = alias,
            CreatedAt = DateTime.UtcNow
        };
        _db.PenPalProfiles.Add(profile);
        await _db.SaveChangesAsync();

        return Ok(new { alias });
    }

    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile()
    {
        var userId = GetUserId();
        var profile = await _db.PenPalProfiles.FirstOrDefaultAsync(p => p.UserId == userId);
        if (profile == null)
        {
            var alias = "Anon_" + Guid.NewGuid().ToString("N")[..8];
            while (await _db.PenPalProfiles.AnyAsync(p => p.Alias == alias))
                alias = "Anon_" + Guid.NewGuid().ToString("N")[..8];

            profile = new PenPalProfile
            {
                UserId = userId,
                Alias = alias,
                CreatedAt = DateTime.UtcNow
            };
            _db.PenPalProfiles.Add(profile);
            await _db.SaveChangesAsync();
        }

        return Ok(new { alias = profile.Alias });
    }

    [HttpGet("inbox")]
    public async Task<IActionResult> GetInbox()
    {
        var userId = GetUserId();
        var profile = await _db.PenPalProfiles.FirstOrDefaultAsync(p => p.UserId == userId);
        if (profile == null)
            return Ok(new { threads = Array.Empty<object>() });

        var alias = profile.Alias;

        var threads = await _db.PenPalThreads
            .Where(t => t.User1Alias == alias || t.User2Alias == alias)
            .OrderByDescending(t => t.CreatedAt)
            .Take(100)
            .ToListAsync();

        var result = new List<object>();
        foreach (var thread in threads)
        {
            var lastMessage = await _db.PenPalMessages
                .Where(m => m.ThreadId == thread.Id)
                .OrderByDescending(m => m.CreatedAt)
                .FirstOrDefaultAsync();

            var unreadCount = await _db.PenPalMessages
                .CountAsync(m => m.ThreadId == thread.Id && !m.IsRead && m.SenderAlias != alias);

            var peerAlias = thread.User1Alias == alias ? thread.User2Alias : thread.User1Alias;
            var myMsgCount = await _db.PenPalMessages
                .CountAsync(m => m.ThreadId == thread.Id && m.SenderAlias == alias);
            var peerMsgCount = await _db.PenPalMessages
                .CountAsync(m => m.ThreadId == thread.Id && m.SenderAlias != alias);

            result.Add(new
            {
                threadId = thread.Id,
                peerAlias,
                lastMessage = lastMessage?.Content,
                lastMessageAt = lastMessage?.CreatedAt,
                unreadCount,
                isClosed = thread.IsClosed,
                messageCount = await _db.PenPalMessages.CountAsync(m => m.ThreadId == thread.Id),
                myMsgCount,
                peerMsgCount
            });
        }

        return Ok(new { threads = result });
    }

    [HttpGet("thread/{id}")]
    public async Task<IActionResult> GetThread(int id)
    {
        var userId = GetUserId();
        var profile = await _db.PenPalProfiles.FirstOrDefaultAsync(p => p.UserId == userId);
        if (profile == null)
            return Unauthorized(new { error = "No alias set" });

        var thread = await _db.PenPalThreads.FindAsync(id);
        if (thread == null)
            return NotFound(new { error = "Thread not found" });

        if (thread.User1Alias != profile.Alias && thread.User2Alias != profile.Alias)
            return Forbid();

        var messages = await _db.PenPalMessages
            .Where(m => m.ThreadId == id)
            .OrderBy(m => m.CreatedAt)
            .Select(m => new { m.Id, m.SenderAlias, m.Content, m.CreatedAt })
            .ToListAsync();

        var unreadMessages = await _db.PenPalMessages
            .Where(m => m.ThreadId == id && !m.IsRead && m.SenderAlias != profile.Alias)
            .ToListAsync();

        foreach (var msg in unreadMessages)
            msg.IsRead = true;

        await _db.SaveChangesAsync();

        return Ok(new
        {
            threadId = thread.Id,
            peerAlias = thread.User1Alias == profile.Alias ? thread.User2Alias : thread.User1Alias,
            isClosed = thread.IsClosed,
            messages
        });
    }

    [HttpPost("send")]
    public async Task<IActionResult> SendMessage([FromBody] SendRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Content))
            return BadRequest(new { error = "Message cannot be empty" });

        if (request.Content.Length > 500)
            return BadRequest(new { error = "Message must be 500 characters or less" });

        var userId = GetUserId();
        var profile = await EnsureProfile(userId);

        var unansweredThreads = await _db.PenPalThreads
            .Where(t => t.User1Alias == profile.Alias && !t.IsClosed)
            .ToListAsync();

        var staleAliases = new List<string>();
        foreach (var t in unansweredThreads)
        {
            var replyCount = await _db.PenPalMessages
                .CountAsync(m => m.ThreadId == t.Id && m.SenderAlias != profile.Alias);
            if (replyCount == 0)
            {
                staleAliases.Add(t.User2Alias);
                var msgs = await _db.PenPalMessages.Where(m => m.ThreadId == t.Id).ToListAsync();
                _db.PenPalMessages.RemoveRange(msgs);
                _db.PenPalThreads.Remove(t);
            }
        }
        await _db.SaveChangesAsync();

        var otherProfiles = await _db.PenPalProfiles
            .Where(p => p.UserId != userId && !staleAliases.Contains(p.Alias))
            .ToListAsync();

        if (otherProfiles.Count == 0)
        {
            otherProfiles = await _db.PenPalProfiles
                .Where(p => p.UserId != userId)
                .ToListAsync();
        }

        if (otherProfiles.Count == 0)
            return BadRequest(new { error = "No other users available right now. Try again later." });

        var random = new Random();
        var recipient = otherProfiles[random.Next(otherProfiles.Count)];

        var thread = new PenPalThread
        {
            User1Alias = profile.Alias,
            User2Alias = recipient.Alias,
            IsClosed = false,
            CreatedAt = DateTime.UtcNow
        };
        _db.PenPalThreads.Add(thread);
        await _db.SaveChangesAsync();

        var message = new PenPalMessage
        {
            ThreadId = thread.Id,
            SenderAlias = profile.Alias,
            Content = request.Content.Trim(),
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };
        _db.PenPalMessages.Add(message);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            threadId = thread.Id,
            peerAlias = recipient.Alias,
            messageId = message.Id
        });
    }

    [HttpPost("reply/{threadId}")]
    public async Task<IActionResult> Reply(int threadId, [FromBody] SendRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Content))
            return BadRequest(new { error = "Message cannot be empty" });

        if (request.Content.Length > 500)
            return BadRequest(new { error = "Message must be 500 characters or less" });

        var userId = GetUserId();
        var profile = await EnsureProfile(userId);

        var thread = await _db.PenPalThreads.FindAsync(threadId);
        if (thread == null)
            return NotFound(new { error = "Thread not found" });

        if (thread.User1Alias != profile.Alias && thread.User2Alias != profile.Alias)
            return Forbid();

        if (thread.IsClosed)
            return BadRequest(new { error = "This conversation has ended" });

        var myMessageCount = await _db.PenPalMessages
            .CountAsync(m => m.ThreadId == threadId && m.SenderAlias == profile.Alias);

        if (myMessageCount >= 5)
            return BadRequest(new { error = "You have reached the maximum messages in this conversation" });

        var message = new PenPalMessage
        {
            ThreadId = threadId,
            SenderAlias = profile.Alias,
            Content = request.Content.Trim(),
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };
        _db.PenPalMessages.Add(message);

        var totalMessages = await _db.PenPalMessages.CountAsync(m => m.ThreadId == threadId) + 1;
        var peerMessages = await _db.PenPalMessages
            .CountAsync(m => m.ThreadId == threadId && m.SenderAlias != profile.Alias);

        if (myMessageCount + 1 >= 5 && peerMessages >= 5)
            thread.IsClosed = true;

        await _db.SaveChangesAsync();

        return Ok(new { messageId = message.Id, isClosed = thread.IsClosed });
    }

    [HttpGet("unread")]
    public async Task<IActionResult> GetUnreadCount()
    {
        var userId = GetUserId();
        var profile = await _db.PenPalProfiles.FirstOrDefaultAsync(p => p.UserId == userId);
        if (profile == null)
            return Ok(new { unread = 0 });

        var count = await _db.PenPalMessages
            .Where(m => !m.IsRead && m.SenderAlias != profile.Alias)
            .Join(_db.PenPalThreads,
                m => m.ThreadId,
                t => t.Id,
                (m, t) => new { m, t })
            .Where(x => x.t.User1Alias == profile.Alias || x.t.User2Alias == profile.Alias)
            .CountAsync();

        return Ok(new { unread = count });
    }

    public record AliasRequest(string Alias);
    public record SendRequest(string Content);
}
