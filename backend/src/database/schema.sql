
-- 1. Business accounts
CREATE TABLE IF NOT EXISTS businesses (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(30),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Users who can access a business account
CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL
        REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'owner'
        CHECK (role IN ('owner', 'staff')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Customers belonging to a business
CREATE TABLE IF NOT EXISTS customers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL
        REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(30),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Customer enquiries and potential sales
CREATE TABLE IF NOT EXISTS enquiries (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL
        REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id BIGINT NOT NULL
        REFERENCES customers(id) ON DELETE RESTRICT,
    created_by BIGINT
        REFERENCES users(id) ON DELETE SET NULL,
    subject VARCHAR(200) NOT NULL,
    description TEXT,
    source VARCHAR(50),
    status VARCHAR(30) NOT NULL DEFAULT 'new'
        CHECK (
            status IN (
                'new',
                'contacted',
                'qualified',
                'converted',
                'lost'
            )
        ),
    estimated_value NUMERIC(12, 2)
        CHECK (estimated_value IS NULL OR estimated_value >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'NGN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Follow-up reminders linked to enquiries
CREATE TABLE IF NOT EXISTS follow_ups (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL
        REFERENCES businesses(id) ON DELETE CASCADE,
    enquiry_id BIGINT NOT NULL
        REFERENCES enquiries(id) ON DELETE CASCADE,
    assigned_to BIGINT
        REFERENCES users(id) ON DELETE SET NULL,
    note TEXT NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'completed',
                'cancelled'
            )
        ),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_users_business_id
    ON users(business_id);

CREATE INDEX IF NOT EXISTS idx_customers_business_id
    ON customers(business_id);

CREATE INDEX IF NOT EXISTS idx_enquiries_business_id
    ON enquiries(business_id);

CREATE INDEX IF NOT EXISTS idx_enquiries_customer_id
    ON enquiries(customer_id);

CREATE INDEX IF NOT EXISTS idx_enquiries_status
    ON enquiries(status);

CREATE INDEX IF NOT EXISTS idx_follow_ups_business_id
    ON follow_ups(business_id);

CREATE INDEX IF NOT EXISTS idx_follow_ups_enquiry_id
    ON follow_ups(enquiry_id);

CREATE INDEX IF NOT EXISTS idx_follow_ups_due_status
    ON follow_ups(status, due_at);
