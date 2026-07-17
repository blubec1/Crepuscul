namespace Afterglow.Api.Models;

public class CheckIn
{
    public int Id { get; set; }
    public int Mood { get; set; }
    public string Note { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
