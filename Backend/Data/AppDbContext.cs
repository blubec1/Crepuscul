using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Afterglow.Api.Models;

namespace Afterglow.Api.Data;

public class AppDbContext : IdentityDbContext<User>
{
    public DbSet<CheckIn> CheckIns => Set<CheckIn>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<Exercise> Exercises => Set<Exercise>();
    public DbSet<CheckInQuestion> CheckInQuestions => Set<CheckInQuestion>();
    public DbSet<CheckInSession> CheckInSessions => Set<CheckInSession>();
    public DbSet<CheckInAnswer> CheckInAnswers => Set<CheckInAnswer>();
    public DbSet<BuddyMatch> BuddyMatches => Set<BuddyMatch>();
    public DbSet<BuddyMessage> BuddyMessages => Set<BuddyMessage>();
    public DbSet<BuddyQueue> BuddyQueues => Set<BuddyQueue>();
    public DbSet<CrisisHotline> CrisisHotlines => Set<CrisisHotline>();

    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<CheckIn>().Property(c => c.Mood).HasDefaultValue(3);

        modelBuilder.Entity<CheckInAnswer>()
            .HasIndex(a => a.CheckInSessionId);

        modelBuilder.Entity<CheckInSession>()
            .HasIndex(s => s.SessionId);

        modelBuilder.Entity<BuddyMatch>()
            .HasIndex(m => m.IsActive);

        modelBuilder.Entity<BuddyMessage>()
            .HasIndex(m => m.BuddyMatchId);

        modelBuilder.Entity<BuddyQueue>()
            .HasIndex(q => q.IsActive);

        modelBuilder.Entity<BuddyQueue>()
            .HasIndex(q => q.SessionId);

        modelBuilder.Entity<CrisisHotline>()
            .HasIndex(h => h.RegionCode);

        // Seed exercises
        modelBuilder.Entity<Exercise>().HasData(
            new Exercise { Id = 1, MoodType = "anxiety", Title = "4-7-8 Breathing", Instructions = "Breathe in through your nose for 4 seconds. Hold your breath for 7 seconds. Exhale slowly through your mouth for 8 seconds. Repeat 4 times.", DurationSeconds = 60 },
            new Exercise { Id = 2, MoodType = "anxiety", Title = "5-4-3-2-1 Grounding", Instructions = "Name 5 things you can see. Name 4 things you can touch. Name 3 things you can hear. Name 2 things you can smell. Name 1 thing you can taste.", DurationSeconds = 90 },
            new Exercise { Id = 3, MoodType = "anxiety", Title = "Box Breathing", Instructions = "Breathe in for 4 seconds. Hold for 4 seconds. Breathe out for 4 seconds. Hold for 4 seconds. Repeat 4 times.", DurationSeconds = 64 },
            new Exercise { Id = 4, MoodType = "insomnia", Title = "Progressive Muscle Relaxation", Instructions = "Starting from your toes, tense each muscle group for 5 seconds, then release. Work upward: feet, calves, thighs, stomach, chest, hands, arms, shoulders, face.", DurationSeconds = 180 },
            new Exercise { Id = 5, MoodType = "insomnia", Title = "Calm Visualization", Instructions = "Close your eyes. Imagine a quiet, safe place - a beach at night, a warm cabin. Focus on the details: the sounds, the temperature, the smells. Stay there for 2 minutes.", DurationSeconds = 120 },
            new Exercise { Id = 6, MoodType = "loneliness", Title = "Letter to Yourself", Instructions = "Imagine a close friend feeling exactly what you feel right now. Write or think about what you would tell them. Now read those words back to yourself. They apply to you too.", DurationSeconds = 120 },
            new Exercise { Id = 7, MoodType = "loneliness", Title = "Connection Reminder", Instructions = "Right now, thousands of people are awake feeling the same way. You are not alone in this. Type a message below to let someone else know they are not alone either.", DurationSeconds = 60 },
            new Exercise { Id = 8, MoodType = "low", Title = "Gratitude Three", Instructions = "Think of 3 small things from today that were okay or good. They can be tiny: a warm drink, a song you heard, a breath that felt easy. Hold each one for a moment.", DurationSeconds = 90 },
            new Exercise { Id = 9, MoodType = "low", Title = "Gentle Stretch", Instructions = "Stand up slowly. Reach your arms above your head. Roll your shoulders back 5 times. Tilt your head gently side to side. Sit back down. You did something kind for your body.", DurationSeconds = 60 },
            new Exercise { Id = 10, MoodType = "any", Title = "Name It to Tame It", Instructions = "Say to yourself: 'Right now I am feeling _____.' Fill in the word. Naming the emotion reduces its power. You are not your emotion - you are the one observing it.", DurationSeconds = 30 },
            new Exercise { Id = 11, MoodType = "any", Title = "One Thing at a Time", Instructions = "You do not need to solve everything right now. Pick one small thing you can do in the next 5 minutes. Do only that. Everything else can wait.", DurationSeconds = 30 }
        );

        // Seed check-in questions
        modelBuilder.Entity<CheckInQuestion>().HasData(
            new CheckInQuestion { Id = 1, Text = "Did you have a nightmare?", Type = "yesno", Order = 1, IsActive = true },
            new CheckInQuestion { Id = 2, Text = "How tired are you?", Type = "scale", Order = 2, IsActive = true },
            new CheckInQuestion { Id = 3, Text = "How relaxed are you?", Type = "scale", Order = 3, IsActive = true },
            new CheckInQuestion { Id = 4, Text = "How melancholic are you?", Type = "scale", Order = 4, IsActive = true },
            new CheckInQuestion { Id = 5, Text = "How easy is it for you to concentrate?", Type = "scale", Order = 5, IsActive = true }
        );

        // Seed crisis hotlines
        modelBuilder.Entity<CrisisHotline>().HasData(
            new CrisisHotline { Id = 1, RegionCode = "US", Name = "988 Suicide & Crisis Lifeline", Number = "988", Type = "tel", IsEmergency = false },
            new CrisisHotline { Id = 2, RegionCode = "US", Name = "Crisis Text Line", Number = "741741", Type = "sms", Prefix = "Text HOME to ", IsEmergency = false },
            new CrisisHotline { Id = 3, RegionCode = "US", Name = "SAMHSA Helpline", Number = "1-800-662-4357", Type = "tel", IsEmergency = false },
            new CrisisHotline { Id = 4, RegionCode = "US", Name = "Emergency", Number = "911", Type = "tel", IsEmergency = true },

            new CrisisHotline { Id = 5, RegionCode = "GB", Name = "Samaritans", Number = "116 123", Type = "tel", IsEmergency = false },
            new CrisisHotline { Id = 6, RegionCode = "GB", Name = "Shout Crisis Text", Number = "85258", Type = "sms", Prefix = "Text SHOUT to ", IsEmergency = false },
            new CrisisHotline { Id = 7, RegionCode = "GB", Name = "Emergency", Number = "999", Type = "tel", IsEmergency = true },

            new CrisisHotline { Id = 8, RegionCode = "RO", Name = "Telefonul Sperantei", Number = "0800 820 020", Type = "tel", IsEmergency = false },
            new CrisisHotline { Id = 9, RegionCode = "RO", Name = "Lifeline Romania", Number = "0800 800 111", Type = "tel", IsEmergency = false },
            new CrisisHotline { Id = 10, RegionCode = "RO", Name = "Emergency", Number = "112", Type = "tel", IsEmergency = true },

            new CrisisHotline { Id = 11, RegionCode = "DE", Name = "Telefonseelsorge", Number = "0800 111 0 111", Type = "tel", IsEmergency = false },
            new CrisisHotline { Id = 12, RegionCode = "DE", Name = "Emergency", Number = "112", Type = "tel", IsEmergency = true },

            new CrisisHotline { Id = 13, RegionCode = "FR", Name = "SOS Amitie", Number = "09 72 39 40 50", Type = "tel", IsEmergency = false },
            new CrisisHotline { Id = 14, RegionCode = "FR", Name = "Emergency", Number = "112", Type = "tel", IsEmergency = true },

            new CrisisHotline { Id = 15, RegionCode = "ES", Name = "Telefono de la Esperanza", Number = "717 000 078", Type = "tel", IsEmergency = false },
            new CrisisHotline { Id = 16, RegionCode = "ES", Name = "Emergency", Number = "112", Type = "tel", IsEmergency = true },

            new CrisisHotline { Id = 17, RegionCode = "IT", Name = "Telefono Amico", Number = "02 2327 2327", Type = "tel", IsEmergency = false },
            new CrisisHotline { Id = 18, RegionCode = "IT", Name = "Emergency", Number = "112", Type = "tel", IsEmergency = true },

            new CrisisHotline { Id = 19, RegionCode = "JP", Name = "TELL Lifeline", Number = "03-5774-0992", Type = "tel", IsEmergency = false },
            new CrisisHotline { Id = 20, RegionCode = "JP", Name = "Emergency", Number = "119", Type = "tel", IsEmergency = true },

            new CrisisHotline { Id = 21, RegionCode = "AU", Name = "Lifeline Australia", Number = "13 11 14", Type = "tel", IsEmergency = false },
            new CrisisHotline { Id = 22, RegionCode = "AU", Name = "Emergency", Number = "000", Type = "tel", IsEmergency = true },

            new CrisisHotline { Id = 23, RegionCode = "CA", Name = "Talk Suicide Canada", Number = "1-833-456-4566", Type = "tel", IsEmergency = false },
            new CrisisHotline { Id = 24, RegionCode = "CA", Name = "Emergency", Number = "911", Type = "tel", IsEmergency = true },

            new CrisisHotline { Id = 25, RegionCode = "BR", Name = "CVV (Life Valuation)", Number = "188", Type = "tel", IsEmergency = false },
            new CrisisHotline { Id = 26, RegionCode = "BR", Name = "Emergency", Number = "192", Type = "tel", IsEmergency = true },

            new CrisisHotline { Id = 27, RegionCode = "IN", Name = "iCall", Number = "9152987821", Type = "tel", IsEmergency = false },
            new CrisisHotline { Id = 28, RegionCode = "IN", Name = "Emergency", Number = "112", Type = "tel", IsEmergency = true },

            new CrisisHotline { Id = 29, RegionCode = "PL", Name = "Centrum Wsparcia", Number = "800 70 2222", Type = "tel", IsEmergency = false },
            new CrisisHotline { Id = 30, RegionCode = "PL", Name = "Phone Crisis", Number = "116 123", Type = "tel", IsEmergency = false },
            new CrisisHotline { Id = 31, RegionCode = "PL", Name = "Emergency", Number = "112", Type = "tel", IsEmergency = true },

            new CrisisHotline { Id = 32, RegionCode = "DEFAULT", Name = "Befrienders Worldwide", Number = "https://www.befrienders.org", Type = "web", IsEmergency = false },
            new CrisisHotline { Id = 33, RegionCode = "DEFAULT", Name = "International Association for Suicide Prevention", Number = "https://www.iasp.info/resources/Crisis_Centres/", Type = "web", IsEmergency = false },
            new CrisisHotline { Id = 34, RegionCode = "DEFAULT", Name = "Emergency (EU)", Number = "112", Type = "tel", IsEmergency = true }
        );
    }
}
