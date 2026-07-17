namespace Afterglow.Api.Models;

public class BuddyQueue
{
    public int Id { get; set; }
    public string SessionId { get; set; } = "";
    public DateTime QueuedAt { get; set; } = DateTime.UtcNow;
    public bool IsActive { get; set; } = true;
}
