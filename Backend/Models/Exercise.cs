namespace Afterglow.Api.Models;

public class Exercise
{
    public int Id { get; set; }
    public string MoodType { get; set; } = "";
    public string Title { get; set; } = "";
    public string Instructions { get; set; } = "";
    public int DurationSeconds { get; set; }
}
