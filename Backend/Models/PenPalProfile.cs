namespace Afterglow.Api.Models;

public class PenPalProfile
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public string Alias { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
