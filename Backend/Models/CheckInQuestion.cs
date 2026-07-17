namespace Afterglow.Api.Models;

public class CheckInQuestion
{
    public int Id { get; set; }
    public string Text { get; set; } = "";
    public string Type { get; set; } = "scale"; // "scale" (1-5) or "yesno"
    public int Order { get; set; }
    public bool IsActive { get; set; } = true;
}
