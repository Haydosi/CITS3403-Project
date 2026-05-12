-- Family Database Schema
-- Stores family-specific savings data and group rankings
-- This is derived from the global database but focused on family groups

CREATE TABLE IF NOT EXISTS family_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    global_group_id INTEGER NOT NULL UNIQUE,
    group_name VARCHAR(50) NOT NULL,
    owner_id INTEGER NOT NULL,
    family_code VARCHAR(20) UNIQUE,
    total_savings FLOAT DEFAULT 0,
    member_count INTEGER DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Family members snapshot - maintains a record of family members and their contributions
CREATE TABLE IF NOT EXISTS family_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_group_id INTEGER NOT NULL,
    global_user_id INTEGER NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    total_savings FLOAT DEFAULT 0,
    contribution_percentage FLOAT DEFAULT 0,
    member_since DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_group_id) REFERENCES family_groups(id) ON DELETE CASCADE,
    UNIQUE (family_group_id, global_user_id)
);

-- Family transactions log - cached transactions for performance
CREATE TABLE IF NOT EXISTS family_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_group_id INTEGER NOT NULL,
    family_member_id INTEGER NOT NULL,
    amount FLOAT NOT NULL,
    description VARCHAR(255),
    transaction_type VARCHAR(50) NOT NULL DEFAULT 'savings',
    recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_group_id) REFERENCES family_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (family_member_id) REFERENCES family_members(id) ON DELETE CASCADE
);

-- Family goals - shared savings goals for the family
CREATE TABLE IF NOT EXISTS family_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_group_id INTEGER NOT NULL,
    goal_name VARCHAR(100) NOT NULL,
    target_amount FLOAT NOT NULL,
    current_amount FLOAT DEFAULT 0,
    deadline DATE,
    status VARCHAR(20) DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_group_id) REFERENCES family_groups(id) ON DELETE CASCADE
);

-- Indexes for family leaderboard queries
CREATE INDEX IF NOT EXISTS idx_family_groups_owner ON family_groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_family_groups_code ON family_groups(family_code);
CREATE INDEX IF NOT EXISTS idx_family_members_group ON family_members(family_group_id);
CREATE INDEX IF NOT EXISTS idx_family_members_user ON family_members(global_user_id);
CREATE INDEX IF NOT EXISTS idx_family_transactions_group ON family_transactions(family_group_id);
CREATE INDEX IF NOT EXISTS idx_family_transactions_member ON family_transactions(family_member_id);
CREATE INDEX IF NOT EXISTS idx_family_goals_group ON family_goals(family_group_id);
