-- ETERNYX Cybersecurity Platform Database Schema
-- This schema supports all the new security features and tools

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table (if not already exists)
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vulnerability Scans table for Black Hat Pentesting
CREATE TABLE vulnerability_scans (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    target_url VARCHAR(500) NOT NULL,
    scan_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    results JSONB,
    vulnerabilities_found INTEGER DEFAULT 0,
    risk_score INTEGER DEFAULT 0,
    scan_duration INTEGER, -- in seconds
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vulnerability Details table
CREATE TABLE vulnerability_details (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    scan_id UUID REFERENCES vulnerability_scans(id) ON DELETE CASCADE,
    vulnerability_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    description TEXT,
    location VARCHAR(500),
    proof_of_concept TEXT,
    remediation TEXT,
    cvss_score DECIMAL(3,1),
    cve_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Threat Intelligence table for Zero-Day Protection
CREATE TABLE threat_intelligence (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    threat_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    source VARCHAR(100) NOT NULL,
    indicator_type VARCHAR(50) NOT NULL, -- IP, domain, hash, etc.
    indicator_value VARCHAR(500) NOT NULL,
    description TEXT,
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confidence_score INTEGER DEFAULT 0, -- 0-100
    is_active BOOLEAN DEFAULT true,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Security Incidents table for monitoring
CREATE TABLE security_incidents (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    incident_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    source_ip INET,
    target_system VARCHAR(200),
    description TEXT,
    status VARCHAR(50) DEFAULT 'open',
    assigned_to UUID REFERENCES users(id),
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Security Analysis table
CREATE TABLE ai_security_analysis (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    analysis_type VARCHAR(100) NOT NULL, -- malware, anomaly, prediction
    input_data JSONB NOT NULL,
    results JSONB NOT NULL,
    confidence_score DECIMAL(5,4), -- 0.0000 to 1.0000
    model_version VARCHAR(50),
    processing_time INTEGER, -- in milliseconds
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Encryption Keys table for Quantum Encryption
CREATE TABLE encryption_keys (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    key_name VARCHAR(200) NOT NULL,
    algorithm VARCHAR(100) NOT NULL,
    key_size INTEGER NOT NULL,
    public_key TEXT,
    private_key_encrypted TEXT, -- encrypted with user's master key
    is_quantum_resistant BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Encrypted Data table
CREATE TABLE encrypted_data (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    key_id UUID REFERENCES encryption_keys(id) ON DELETE CASCADE,
    data_name VARCHAR(200) NOT NULL,
    encrypted_content TEXT NOT NULL,
    original_size INTEGER,
    encryption_algorithm VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Project Requests table for Elite Development Team
CREATE TABLE project_requests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    project_type VARCHAR(100) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    requirements TEXT,
    timeline VARCHAR(100),
    budget_range VARCHAR(100),
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(50) DEFAULT 'submitted',
    assigned_team_member UUID REFERENCES users(id),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Threat Monitoring Events table
CREATE TABLE threat_monitoring_events (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    source_ip INET,
    destination_ip INET,
    source_port INTEGER,
    destination_port INTEGER,
    protocol VARCHAR(20),
    event_data JSONB,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_false_positive BOOLEAN DEFAULT false,
    analyst_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Network Traffic Analysis table
CREATE TABLE network_traffic_analysis (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    analysis_name VARCHAR(200),
    traffic_data JSONB NOT NULL,
    anomalies_detected INTEGER DEFAULT 0,
    risk_level VARCHAR(20) DEFAULT 'low',
    analysis_results JSONB,
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API Keys table for external integrations
CREATE TABLE api_keys (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    service_name VARCHAR(100) NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used TIMESTAMP WITH TIME ZONE
);

-- Audit Logs table
CREATE TABLE audit_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_vulnerability_scans_user_id ON vulnerability_scans(user_id);
CREATE INDEX idx_vulnerability_scans_status ON vulnerability_scans(status);
CREATE INDEX idx_vulnerability_details_scan_id ON vulnerability_details(scan_id);
CREATE INDEX idx_threat_intelligence_indicator ON threat_intelligence(indicator_value);
CREATE INDEX idx_threat_intelligence_active ON threat_intelligence(is_active);
CREATE INDEX idx_security_incidents_status ON security_incidents(status);
CREATE INDEX idx_security_incidents_severity ON security_incidents(severity);
CREATE INDEX idx_ai_security_analysis_user_id ON ai_security_analysis(user_id);
CREATE INDEX idx_ai_security_analysis_type ON ai_security_analysis(analysis_type);
CREATE INDEX idx_encryption_keys_user_id ON encryption_keys(user_id);
CREATE INDEX idx_project_requests_user_id ON project_requests(user_id);
CREATE INDEX idx_project_requests_status ON project_requests(status);
CREATE INDEX idx_threat_monitoring_events_type ON threat_monitoring_events(event_type);
CREATE INDEX idx_threat_monitoring_events_detected_at ON threat_monitoring_events(detected_at);
CREATE INDEX idx_network_traffic_analysis_user_id ON network_traffic_analysis(user_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Create RLS (Row Level Security) policies
ALTER TABLE vulnerability_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE vulnerability_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_security_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE encryption_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE encrypted_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_traffic_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user data access
CREATE POLICY "Users can view their own vulnerability scans" ON vulnerability_scans
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own vulnerability scans" ON vulnerability_scans
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own AI analysis" ON ai_security_analysis
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI analysis" ON ai_security_analysis
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own encryption keys" ON encryption_keys
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own encryption keys" ON encryption_keys
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own encrypted data" ON encrypted_data
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own encrypted data" ON encrypted_data
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own project requests" ON project_requests
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own project requests" ON project_requests
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own network analysis" ON network_traffic_analysis
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own network analysis" ON network_traffic_analysis
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Functions for common operations
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at columns
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_requests_updated_at BEFORE UPDATE ON project_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate risk score based on vulnerabilities
CREATE OR REPLACE FUNCTION calculate_risk_score(scan_id UUID)
RETURNS INTEGER AS $$
DECLARE
    risk_score INTEGER := 0;
    vuln_record RECORD;
BEGIN
    FOR vuln_record IN 
        SELECT severity, cvss_score 
        FROM vulnerability_details 
        WHERE scan_id = calculate_risk_score.scan_id
    LOOP
        CASE vuln_record.severity
            WHEN 'critical' THEN risk_score := risk_score + 10;
            WHEN 'high' THEN risk_score := risk_score + 7;
            WHEN 'medium' THEN risk_score := risk_score + 4;
            WHEN 'low' THEN risk_score := risk_score + 1;
        END CASE;
        
        -- Add CVSS score if available
        IF vuln_record.cvss_score IS NOT NULL THEN
            risk_score := risk_score + ROUND(vuln_record.cvss_score);
        END IF;
    END LOOP;
    
    RETURN LEAST(risk_score, 100); -- Cap at 100
END;
$$ LANGUAGE plpgsql;

-- Function to get threat statistics
CREATE OR REPLACE FUNCTION get_threat_statistics(days INTEGER DEFAULT 7)
RETURNS TABLE(
    total_threats INTEGER,
    critical_threats INTEGER,
    high_threats INTEGER,
    medium_threats INTEGER,
    low_threats INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_threats,
        COUNT(CASE WHEN severity = 'critical' THEN 1 END)::INTEGER as critical_threats,
        COUNT(CASE WHEN severity = 'high' THEN 1 END)::INTEGER as high_threats,
        COUNT(CASE WHEN severity = 'medium' THEN 1 END)::INTEGER as medium_threats,
        COUNT(CASE WHEN severity = 'low' THEN 1 END)::INTEGER as low_threats
    FROM threat_monitoring_events
    WHERE detected_at >= NOW() - INTERVAL '%s days' % days;
END;
$$ LANGUAGE plpgsql;

-- Insert sample threat intelligence data
INSERT INTO threat_intelligence (threat_type, severity, source, indicator_type, indicator_value, description, confidence_score) VALUES
('Malware', 'critical', 'VirusTotal', 'hash', 'a1b2c3d4e5f6789012345678901234567890abcd', 'Known ransomware hash', 95),
('Botnet', 'high', 'Threat Intel Feed', 'ip', '192.0.2.100', 'Command and control server', 88),
('Phishing', 'medium', 'Security Vendor', 'domain', 'fake-bank-login.com', 'Phishing domain targeting financial institutions', 75),
('APT', 'critical', 'Government Feed', 'ip', '203.0.113.50', 'Advanced persistent threat infrastructure', 92);

-- Insert sample monitoring events
INSERT INTO threat_monitoring_events (event_type, severity, source_ip, destination_ip, source_port, destination_port, protocol, event_data) VALUES
('DDoS Attack', 'critical', '198.51.100.10', '192.0.2.1', 80, 80, 'TCP', '{"packets_per_second": 50000, "attack_vector": "SYN flood"}'),
('Malware Detection', 'high', '192.0.2.50', NULL, NULL, NULL, NULL, '{"malware_family": "Emotet", "file_hash": "abc123def456"}'),
('Suspicious Login', 'medium', '203.0.113.25', '192.0.2.10', 22, 22, 'TCP', '{"failed_attempts": 15, "username": "admin"}'),
('Port Scan', 'low', '198.51.100.20', '192.0.2.1', NULL, NULL, 'TCP', '{"ports_scanned": [22, 80, 443, 3389], "scan_type": "SYN scan"}');

COMMENT ON TABLE vulnerability_scans IS 'Stores vulnerability scan results from penetration testing';
COMMENT ON TABLE threat_intelligence IS 'Threat intelligence indicators and IOCs';
COMMENT ON TABLE security_incidents IS 'Security incidents and their resolution status';
COMMENT ON TABLE ai_security_analysis IS 'AI-powered security analysis results';
COMMENT ON TABLE encryption_keys IS 'User encryption keys for quantum-ready encryption';
COMMENT ON TABLE project_requests IS 'Elite development team project requests';
COMMENT ON TABLE threat_monitoring_events IS 'Real-time threat monitoring events';
COMMENT ON TABLE network_traffic_analysis IS 'Network traffic anomaly analysis results';

