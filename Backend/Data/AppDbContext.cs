using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Crepuscul.Api.Models;

namespace Crepuscul.Api.Data;

public class AppDbContext : IdentityDbContext<User>
{
    public DbSet<CheckIn> CheckIns => Set<CheckIn>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<Exercise> Exercises => Set<Exercise>();

    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<CheckIn>().Property(c => c.Mood).HasDefaultValue(3);

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
    }
}
