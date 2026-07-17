namespace Afterglow.Api.Models;

public class CheckInAnswer
{
    public int Id { get; set; }
    public int CheckInSessionId { get; set; }
    public CheckInSession? CheckInSession { get; set; }
    public int CheckInQuestionId { get; set; }
    public CheckInQuestion? CheckInQuestion { get; set; }
    public int Value { get; set; } // scale: 1-5, yesno: 0=no 1=yes
}
