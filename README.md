# Boss Fight

Boss Fight turns big household chores into tiny co-op battles.

Instead of tracking `Clean the house`, you fight a boss like **Laundry Dragon**. Every chore is an attack, every finished step deals damage, and recurring life mess becomes a game loop instead of another beige checklist.

## MVP

- Kotlin + Jetpack Compose Android app
- Single playable boss battle
- Laundry Dragon sprite asset
- HP bar, attacks, victory state, and quick reset
- Party progress panel for lightweight family/shared-house flavor

## Product Direction

Boss Fight should feel like a small game first and a chore tracker second.

Near-term ideas:

- Custom bosses for laundry, dishes, paperwork, packing, and toy cleanup
- Recurring bosses that regenerate on a schedule
- Local persistence for active battles
- Player profiles and contribution history
- Optional silly boss/task generator later

## Development

Open the project in Android Studio and run the `app` configuration.

This repo does not currently include a generated Gradle wrapper. Android Studio can create one from the checked-in Gradle project files, or you can run `gradle wrapper` locally if Gradle is installed.
