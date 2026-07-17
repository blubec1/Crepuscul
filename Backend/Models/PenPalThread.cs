namespace Afterglow.Api.Models;

public class PenPalThread
{
    public int Id { get; set; }
    public string User1Alias { get; set; } = "";
    public string User2Alias { get; set; } = "";
    public bool IsClosed { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<PenPalMessage> Messages { get; set; } = new();
}
