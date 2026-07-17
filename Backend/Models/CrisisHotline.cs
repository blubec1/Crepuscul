namespace Afterglow.Api.Models;

public class CrisisHotline
{
    public int Id { get; set; }
    public string RegionCode { get; set; } = ""; // ISO country code, e.g. "US", "GB"
    public string Name { get; set; } = "";
    public string Number { get; set; } = ""; // phone number or URL
    public string Type { get; set; } = "tel"; // "tel", "sms", "web"
    public string Prefix { get; set; } = ""; // e.g. "Text HOME to "
    public bool IsEmergency { get; set; } = false;
}
