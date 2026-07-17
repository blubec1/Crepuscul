using Microsoft.AspNetCore.SignalR;

namespace Crepuscul.Api.Hubs;

public class SupportHub : Hub
{
    public async Task SendMessage(string content)
    {
        var username = Context.User?.Identity?.Name ?? "Anonymous";
        await Clients.All.SendAsync("ReceiveMessage", username, content, DateTime.UtcNow);
    }

    public override async Task OnConnectedAsync()
    {
        var username = Context.User?.Identity?.Name ?? "Anonymous";
        await Clients.All.SendAsync("UserConnected", username);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var username = Context.User?.Identity?.Name ?? "Anonymous";
        await Clients.All.SendAsync("UserDisconnected", username);
        await base.OnDisconnectedAsync(exception);
    }
}
