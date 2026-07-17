namespace Afterglow.Api.Models;

public class BuddyMessage
{
    public int Id { get; set; }
    public int BuddyMatchId { get; set; }
    public BuddyMatch? BuddyMatch { get; set; }
    public string SenderSessionId { get; set; } = "";
    public string Text { get; set; } = "";
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
}
