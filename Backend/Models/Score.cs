using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Backend.Models;

public class Score
{
    public int Id { get; set; }

    public int UserId { get; set; }

    [ForeignKey("UserId")]
    public User? User { get; set; }

    [Required]
    [MaxLength(100)]
    public string GameName { get; set; } = string.Empty;

    public int Points { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
