using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Backend.Models;

public class BreathingSession
{
    public int Id { get; set; }

    public int UserId { get; set; }

    [ForeignKey("UserId")]
    public User? User { get; set; }

    public int DurationSeconds { get; set; }

    public DateTime CompletedAt { get; set; } = DateTime.UtcNow;
}
