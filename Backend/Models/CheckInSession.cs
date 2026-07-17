namespace Afterglow.Api.Models;

public class CheckInSession
{
    public int Id { get; set; }
    public string SessionId { get; set; } = ""; // guest UUID or user ID string
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<CheckInAnswer> Answers { get; set; } = new();
}
