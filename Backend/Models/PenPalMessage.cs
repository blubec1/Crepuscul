namespace Afterglow.Api.Models;

public class PenPalMessage
{
    public int Id { get; set; }
    public int ThreadId { get; set; }
    public PenPalThread? Thread { get; set; }
    public string SenderAlias { get; set; } = "";
    public string Content { get; set; } = "";
    public bool IsRead { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
