namespace Afterglow.Api.Models;

public class BuddyMatch
{
    public int Id { get; set; }
    public string SessionId1 { get; set; } = "";
    public string SessionId2 { get; set; } = "";
    public double MatchScore { get; set; } // total difference — lower = more similar
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
