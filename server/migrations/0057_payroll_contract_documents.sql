-- Private, versioned employment-contract metadata. PDF bytes remain in private R2.

CREATE TABLE IF NOT EXISTS payroll_contract_documents (
    document_id TEXT PRIMARY KEY,
    employee_key TEXT NOT NULL,
    version_key TEXT NOT NULL UNIQUE,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    effective_from_bangkok TEXT NOT NULL
        CHECK (effective_from_bangkok GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    effective_to_bangkok TEXT
        CHECK (effective_to_bangkok IS NULL OR effective_to_bangkok GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    document_status TEXT NOT NULL
        CHECK (document_status IN ('ACTIVE', 'SUPERSEDED', 'REVOKED')),
    object_key TEXT NOT NULL UNIQUE,
    sha256_hex TEXT NOT NULL
        CHECK (length(sha256_hex) = 64 AND sha256_hex NOT GLOB '*[^0-9a-f]*'),
    byte_size INTEGER NOT NULL CHECK (byte_size > 0),
    mime_type TEXT NOT NULL CHECK (mime_type = 'application/pdf'),
    download_filename TEXT NOT NULL
        CHECK (length(download_filename) BETWEEN 5 AND 160),
    supersedes_document_id TEXT,
    uploaded_by_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,

    UNIQUE (employee_key, version_number),

    FOREIGN KEY (employee_key)
        REFERENCES payroll_employees(employee_key)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (supersedes_document_id)
        REFERENCES payroll_contract_documents(document_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (uploaded_by_user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_contract_documents_one_active
    ON payroll_contract_documents(employee_key)
    WHERE document_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_payroll_contract_documents_employee_history
    ON payroll_contract_documents(employee_key, version_number DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS payroll_contract_document_access_audit (
    access_audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL,
    employee_key TEXT NOT NULL,
    actor_user_id TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    access_action TEXT NOT NULL CHECK (access_action IN ('VIEW', 'DOWNLOAD')),
    accessed_at TEXT NOT NULL,

    FOREIGN KEY (document_id)
        REFERENCES payroll_contract_documents(document_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (employee_key)
        REFERENCES payroll_employees(employee_key)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (actor_user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_payroll_contract_access_document_time
    ON payroll_contract_document_access_audit(document_id, accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_payroll_contract_access_actor_time
    ON payroll_contract_document_access_audit(actor_user_id, accessed_at DESC);

CREATE TRIGGER IF NOT EXISTS payroll_contract_document_no_delete
BEFORE DELETE ON payroll_contract_documents
BEGIN
    SELECT RAISE(ABORT, 'payroll contract document metadata is immutable');
END;

CREATE TRIGGER IF NOT EXISTS payroll_contract_document_immutable_fields
BEFORE UPDATE ON payroll_contract_documents
WHEN NEW.document_id <> OLD.document_id
  OR NEW.employee_key <> OLD.employee_key
  OR NEW.version_key <> OLD.version_key
  OR NEW.version_number <> OLD.version_number
  OR NEW.effective_from_bangkok <> OLD.effective_from_bangkok
  OR COALESCE(NEW.effective_to_bangkok, '') <> COALESCE(OLD.effective_to_bangkok, '')
  OR NEW.object_key <> OLD.object_key
  OR NEW.sha256_hex <> OLD.sha256_hex
  OR NEW.byte_size <> OLD.byte_size
  OR NEW.mime_type <> OLD.mime_type
  OR NEW.download_filename <> OLD.download_filename
  OR COALESCE(NEW.supersedes_document_id, '') <> COALESCE(OLD.supersedes_document_id, '')
  OR NEW.uploaded_by_user_id <> OLD.uploaded_by_user_id
  OR NEW.created_at <> OLD.created_at
BEGIN
    SELECT RAISE(ABORT, 'payroll contract document version fields are immutable');
END;

CREATE TRIGGER IF NOT EXISTS payroll_contract_document_status_transition
BEFORE UPDATE OF document_status ON payroll_contract_documents
WHEN NEW.document_status = 'ACTIVE'
  OR OLD.document_status IN ('SUPERSEDED', 'REVOKED')
BEGIN
    SELECT RAISE(ABORT, 'payroll contract document status transition is invalid');
END;

CREATE TRIGGER IF NOT EXISTS payroll_contract_access_audit_no_update
BEFORE UPDATE ON payroll_contract_document_access_audit
BEGIN
    SELECT RAISE(ABORT, 'payroll contract access audit is append-only');
END;

CREATE TRIGGER IF NOT EXISTS payroll_contract_access_audit_no_delete
BEFORE DELETE ON payroll_contract_document_access_audit
BEGIN
    SELECT RAISE(ABORT, 'payroll contract access audit is append-only');
END;
