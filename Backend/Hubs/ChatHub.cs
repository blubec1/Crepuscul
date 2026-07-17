using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;

namespace Backend.Hubs;

public class ChatHub : Hub
{
    private readonly AppDbContext _db;

    public ChatHub(AppDbContext db)
    {
        _db = db;
    }

    public async Task SendMessage(string username, string text)
    {
        if (string.IsNullOrWhiteSpace(text) || text.Length > 1000)
            return;

        if (string.IsNullOrWhiteSpace(username) || username.Length > 50)
            return;

        var message = new ChatMessage
        {
            Username = username,
            Text = text,
            SentAt = DateTime.UtcNow
        };

        _db.ChatMessages.Add(message);
        await _db.SaveChangesAsync();

        await Clients.All.SendAsync("ReceiveMessage", username, text, message.SentAt.ToString("o"));
    }

    public async Task GetRecentMessages(int count = 50)
    {
        var messages = await _db.ChatMessages
            .OrderByDescending(m => m.SentAt)
            .Take(Math.Clamp(count, 1, 100))
            .OrderBy(m => m.SentAt)
            .Select(m => new
            {
                m.Username,
                m.Text,
                SentAt = m.SentAt.ToString("o")
            })
            .ToListAsync();

        await Clients.Caller.SendAsync("RecentMessages", messages);
    }

    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync("SystemMessage", "Connected to chat server");
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await base.OnDisconnectedAsync(exception);
    }
}
