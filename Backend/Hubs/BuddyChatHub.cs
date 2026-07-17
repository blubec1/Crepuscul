using Microsoft.AspNetCore.SignalR;
using Afterglow.Api.Data;
using Afterglow.Api.Models;

namespace Afterglow.Api.Hubs;

public class BuddyChatHub : Hub
{
    private readonly AppDbContext _db;

    public BuddyChatHub(AppDbContext db) => _db = db;

    public async Task JoinBuddyChat(int matchId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"buddy-{matchId}");
        await Clients.Caller.SendAsync("JoinedChat", matchId);
    }

    public async Task SendBuddyMessage(int matchId, string sessionId, string text)
    {
        if (string.IsNullOrWhiteSpace(text) || text.Length > 500)
            return;

        if (string.IsNullOrWhiteSpace(sessionId))
            return;

        var match = await _db.BuddyMatches.FindAsync(matchId);
        if (match == null) return;

        if (match.SessionId1 != sessionId && match.SessionId2 != sessionId)
            return;

        var message = new BuddyMessage
        {
            BuddyMatchId = matchId,
            SenderSessionId = sessionId,
            Text = text.Trim(),
            SentAt = DateTime.UtcNow
        };

        _db.BuddyMessages.Add(message);
        await _db.SaveChangesAsync();

        await Clients.Group($"buddy-{matchId}").SendAsync("ReceiveBuddyMessage", sessionId, text.Trim(), message.SentAt.ToString("o"));
    }

    public override async Task OnConnectedAsync()
    {
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await base.OnDisconnectedAsync(exception);
    }
}
