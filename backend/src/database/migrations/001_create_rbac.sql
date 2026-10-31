-- 1. Global permission catalogue
CREATE TABLE permissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Custom roles belonging to individual businesses
CREATE TABLE roles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL
        REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_business_role_name
        UNIQUE (business_id, name),

    CONSTRAINT unique_role_business_pair
        UNIQUE (id, business_id)
);

-- 3. Permissions assigned to custom roles
CREATE TABLE role_permissions (
    role_id BIGINT NOT NULL
        REFERENCES roles(id) ON DELETE CASCADE,

    permission_id BIGINT NOT NULL
        REFERENCES permissions(id) ON DELETE RESTRICT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (role_id, permission_id)
);

-- 4. Add custom role assignment to users
ALTER TABLE users
ADD COLUMN role_id BIGINT;

-- Ensure users can only receive roles belonging to their business
ALTER TABLE users
ADD CONSTRAINT users_role_business_fk
FOREIGN KEY (role_id, business_id)
REFERENCES roles(id, business_id)
ON DELETE RESTRICT;

-- Owners cannot receive custom staff roles
ALTER TABLE users
ADD CONSTRAINT owners_cannot_have_custom_roles
CHECK (role <> 'owner' OR role_id IS NULL);

-- 5. Indexes
CREATE INDEX idx_roles_business_id
ON roles(business_id);

CREATE INDEX idx_users_role_id
ON users(role_id);

-- 6. Initial permission catalogue
INSERT INTO permissions (code, description)
VALUES
    ('customers.view', 'View business customers'),
    ('customers.create', 'Create business customers'),
    ('customers.edit', 'Edit business customers'),
    ('customers.delete', 'Delete business customers'),

    ('enquiries.view', 'View customer enquiries'),
    ('enquiries.create', 'Create customer enquiries'),
    ('enquiries.edit', 'Edit customer enquiries'),
    ('enquiries.delete', 'Delete customer enquiries'),

    ('follow_ups.view', 'View follow-ups'),
    ('follow_ups.create', 'Create follow-ups'),
    ('follow_ups.edit', 'Edit follow-ups'),
    ('follow_ups.delete', 'Delete follow-ups'),

    ('dashboard.view', 'View the business dashboard');
