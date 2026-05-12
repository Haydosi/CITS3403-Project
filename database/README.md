# MyMoney Database Schema

The database is split into **2 logical sections**: Global and Family databases.

## Database Structure

### 1. Global Database
Stores all global user data and worldwide transaction records.

**Tables:**
- `users` - User accounts, authentication, and profile info
- `transactions` - All savings transactions across the platform
- `groups` - Family/group definitions
- `user_group_memberships` - Maps users to groups with roles

**Purpose:** 
- Track individual user savings globally
- Create the world leaderboard rankings
- Support group management

### 2. Family Database
Stores family-specific data and group rankings.

**Tables:**
- `family_groups` - Family group details with savings aggregation
- `family_members` - Family member snapshots and contribution percentages
- `family_transactions` - Family-specific transaction cache
- `family_goals` - Shared savings goals for families

**Purpose:**
- Track family group savings separately
- Provide family-specific leaderboard rankings
- Support shared family financial goals
- Cache data for performance optimization

## Setup

### Option 1: Using Flask Migrations (Recommended)
```bash
flask db upgrade
```

This will apply all migrations including the new `9a4c5d3e2f1b` migration that creates both global and family tables.

### Option 2: Direct SQL
Run these files in order:
1. `Users_ldb.sql` - Complete schema (both global and family tables)
2. Or separately:
   - `global_db.sql` - Global database schema
   - `family_db.sql` - Family database schema

## Data Flow

### Global Leaderboard
1. User creates a transaction → stored in `transactions` table
2. API queries `transactions` table grouped by user
3. Rankings calculated by total `amount` per user
4. Frontend displays percentages only

### Family Leaderboard
1. User in a group creates a transaction → stored in `transactions` with `group_id`
2. API queries `transactions` filtered by `group_id`
3. `family_members` table maintains member snapshots
4. Rankings calculated by total `amount` per group member
5. Frontend displays percentages only

## Key Features

- **Privacy:** Individual savings amounts stored in database but displayed as percentages only
- **Performance:** Indexes on foreign keys and frequently queried columns
- **Scalability:** Separate family table allows for specialized queries and caching
- **Integrity:** Foreign key constraints ensure data consistency

## Migration History

- `8bfa2c439e6e` - Initial user setup
- `9a4c5d3e2f1b` - Add transactions and family database tables ✨ (Current)

## Next Steps

1. Run migrations: `flask db upgrade`
2. Add sample transaction data
3. Test leaderboard endpoints:
   - `GET /api/private/leaderboard` - Global rankings
   - `GET /api/private/leaderboard/family/1` - Family rankings
