-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'premium')),
  company TEXT,
  website TEXT,
  location TEXT,
  skills TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create blog posts table
CREATE TABLE public.blog_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  content TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('cybersecurity', 'development', 'tutorials', 'news')),
  tags TEXT[],
  featured_image TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  is_published BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create projects/portfolio table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  long_description TEXT,
  tech_stack TEXT[] NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('web-development', 'cybersecurity', 'mobile-app', 'blockchain', 'ai-ml')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('planning', 'in-progress', 'completed', 'archived')),
  client_name TEXT,
  project_url TEXT,
  github_url TEXT,
  image_urls TEXT[],
  start_date DATE,
  end_date DATE,
  budget_range TEXT,
  testimonial TEXT,
  featured BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create services table
CREATE TABLE public.services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  short_description TEXT NOT NULL,
  full_description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('cybersecurity', 'development', 'consulting', 'training')),
  features TEXT[] NOT NULL,
  pricing_tiers JSONB,
  icon_name TEXT,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create contact submissions table
CREATE TABLE public.contact_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  service_interested TEXT,
  budget_range TEXT,
  timeline TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'in-progress', 'completed', 'archived')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  notes TEXT,
  assigned_to UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create security scans table
CREATE TABLE public.security_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  target_url TEXT NOT NULL,
  scan_type TEXT NOT NULL CHECK (scan_type IN ('basic', 'comprehensive', 'vulnerability', 'ssl')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  results JSONB,
  score INTEGER CHECK (score >= 0 AND score <= 100),
  vulnerabilities_found INTEGER DEFAULT 0,
  recommendations TEXT[],
  scan_duration INTEGER, -- in seconds
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create pricing plans table
CREATE TABLE public.pricing_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_monthly DECIMAL(10,2),
  price_yearly DECIMAL(10,2),
  features TEXT[] NOT NULL,
  max_projects INTEGER,
  max_scans INTEGER,
  support_level TEXT DEFAULT 'email' CHECK (support_level IN ('email', 'priority', 'dedicated')),
  is_popular BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  is_read BOOLEAN DEFAULT false,
  action_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for blog_posts
CREATE POLICY "Published blog posts are viewable by everyone" ON public.blog_posts FOR SELECT USING (is_published = true OR auth.uid() IN (SELECT user_id FROM public.profiles WHERE role = 'admin'));
CREATE POLICY "Admins can manage blog posts" ON public.blog_posts FOR ALL USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE role = 'admin'));

-- RLS Policies for projects
CREATE POLICY "Projects are viewable by everyone" ON public.projects FOR SELECT USING (true);
CREATE POLICY "Admins can manage projects" ON public.projects FOR ALL USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE role = 'admin'));

-- RLS Policies for services
CREATE POLICY "Active services are viewable by everyone" ON public.services FOR SELECT USING (is_active = true OR auth.uid() IN (SELECT user_id FROM public.profiles WHERE role = 'admin'));
CREATE POLICY "Admins can manage services" ON public.services FOR ALL USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE role = 'admin'));

-- RLS Policies for contact_submissions
CREATE POLICY "Admins can view all contact submissions" ON public.contact_submissions FOR SELECT USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE role = 'admin'));
CREATE POLICY "Anyone can create contact submissions" ON public.contact_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can update contact submissions" ON public.contact_submissions FOR UPDATE USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE role = 'admin'));

-- RLS Policies for security_scans
CREATE POLICY "Users can view their own scans" ON public.security_scans FOR SELECT USING (auth.uid() = user_id OR auth.uid() IN (SELECT user_id FROM public.profiles WHERE role = 'admin'));
CREATE POLICY "Authenticated users can create scans" ON public.security_scans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own scans" ON public.security_scans FOR UPDATE USING (auth.uid() = user_id OR auth.uid() IN (SELECT user_id FROM public.profiles WHERE role = 'admin'));

-- RLS Policies for pricing_plans
CREATE POLICY "Active pricing plans are viewable by everyone" ON public.pricing_plans FOR SELECT USING (is_active = true OR auth.uid() IN (SELECT user_id FROM public.profiles WHERE role = 'admin'));
CREATE POLICY "Admins can manage pricing plans" ON public.pricing_plans FOR ALL USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE role = 'admin'));

-- RLS Policies for notifications
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can create notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM public.profiles WHERE role = 'admin'));

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contact_submissions_updated_at BEFORE UPDATE ON public.contact_submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pricing_plans_updated_at BEFORE UPDATE ON public.pricing_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial data
INSERT INTO public.services (name, slug, short_description, full_description, category, features, pricing_tiers, icon_name, is_active, order_index) VALUES
('Penetration Testing', 'penetration-testing', 'Comprehensive security testing to identify vulnerabilities', 'Our expert penetration testing services simulate real-world attacks to identify security weaknesses in your systems, applications, and networks. We provide detailed reports with actionable recommendations to strengthen your security posture.', 'cybersecurity', ARRAY['Network Penetration Testing', 'Web Application Testing', 'Social Engineering Assessment', 'Detailed Vulnerability Reports', 'Remediation Guidance'], '{"basic": {"price": 2500, "features": ["Basic vulnerability scan", "Network assessment", "Basic report"]}, "comprehensive": {"price": 5000, "features": ["Full penetration test", "Web app testing", "Detailed report", "Remediation support"]}, "enterprise": {"price": 10000, "features": ["Complete security audit", "Advanced testing", "Ongoing support", "Custom reporting"]}}', 'Shield', true, 1),
('Full Stack Development', 'full-stack-development', 'End-to-end web application development', 'We build robust, scalable web applications using modern technologies. From concept to deployment, we handle frontend, backend, database design, and cloud infrastructure to deliver high-performance applications.', 'development', ARRAY['React/Next.js Frontend', 'Node.js/Python Backend', 'Database Design', 'Cloud Deployment', 'API Development', 'Performance Optimization'], '{"startup": {"price": 5000, "features": ["MVP development", "Basic features", "Standard hosting"]}, "business": {"price": 15000, "features": ["Full-featured app", "Advanced functionality", "Premium hosting", "Support"]}, "enterprise": {"price": 35000, "features": ["Custom enterprise solution", "Advanced integrations", "Dedicated support", "Scalable architecture"]}}', 'Code', true, 2),
('Security Consulting', 'security-consulting', 'Expert cybersecurity strategy and implementation', 'Our security experts provide strategic guidance to strengthen your organization''s security posture. We assess current systems, develop security policies, and implement best practices to protect against evolving threats.', 'consulting', ARRAY['Security Assessment', 'Policy Development', 'Compliance Guidance', 'Risk Management', 'Security Training', 'Incident Response Planning'], '{"consultation": {"price": 200, "features": ["1-hour consultation", "Basic assessment", "Recommendations"]}, "strategy": {"price": 2000, "features": ["Comprehensive security strategy", "Policy development", "Implementation roadmap"]}, "ongoing": {"price": 5000, "features": ["Monthly consulting", "Continuous monitoring", "Regular updates", "Priority support"]}}', 'Users', true, 3),
('Cybersecurity Training', 'cybersecurity-training', 'Comprehensive security awareness and technical training', 'Empower your team with cutting-edge cybersecurity knowledge. Our training programs cover everything from basic security awareness to advanced technical skills, tailored to your organization''s needs.', 'training', ARRAY['Security Awareness Training', 'Technical Skills Development', 'Phishing Simulation', 'Compliance Training', 'Custom Curricula', 'Certification Preparation'], '{"basic": {"price": 500, "features": ["Basic awareness training", "Online modules", "Certificate of completion"]}, "advanced": {"price": 1500, "features": ["Technical training", "Hands-on labs", "Expert instruction", "Advanced certification"]}, "enterprise": {"price": 5000, "features": ["Custom training program", "On-site delivery", "Ongoing support", "Team assessments"]}}', 'GraduationCap', true, 4);

INSERT INTO public.pricing_plans (name, description, price_monthly, price_yearly, features, max_projects, max_scans, support_level, is_popular, order_index) VALUES
('Starter', 'Perfect for individuals and small projects', 29.99, 299.99, ARRAY['Basic Security Scans', 'Project Portfolio', 'Email Support', 'Basic Analytics', 'SSL Monitoring'], 3, 10, 'email', false, 1),
('Professional', 'Ideal for growing businesses', 99.99, 999.99, ARRAY['Advanced Security Scans', 'Unlimited Projects', 'Priority Support', 'Advanced Analytics', 'Custom Reports', 'API Access'], 10, 50, 'priority', true, 2),
('Enterprise', 'For large organizations with complex needs', 299.99, 2999.99, ARRAY['Comprehensive Security Suite', 'Unlimited Everything', 'Dedicated Support', 'Custom Integrations', 'White-label Options', 'SLA Guarantee'], -1, -1, 'dedicated', false, 3);

INSERT INTO public.projects (title, description, long_description, tech_stack, category, status, client_name, project_url, image_urls, start_date, end_date, featured) VALUES
('E-commerce Security Platform', 'Comprehensive security solution for online retailers', 'Built a complete security platform that monitors e-commerce websites for vulnerabilities, provides real-time threat detection, and ensures PCI DSS compliance. The platform reduced security incidents by 85% and improved customer trust.', ARRAY['React', 'Node.js', 'PostgreSQL', 'AWS', 'Docker', 'Redis'], 'cybersecurity', 'completed', 'TechCorp Solutions', 'https://example-ecommerce-security.com', ARRAY['/placeholder.svg'], '2024-01-15', '2024-06-30', true),
('Financial Trading Dashboard', 'Real-time trading platform with advanced security', 'Developed a high-frequency trading dashboard with military-grade encryption, real-time data processing, and advanced threat protection. Handles over 1M transactions daily with 99.99% uptime.', ARRAY['Next.js', 'Python', 'MongoDB', 'WebSocket', 'Machine Learning', 'Kubernetes'], 'web-development', 'completed', 'FinanceMax Ltd', 'https://example-trading.com', ARRAY['/placeholder.svg'], '2023-09-01', '2024-03-15', true),
('Healthcare Data Protection System', 'HIPAA-compliant data protection for healthcare providers', 'Implemented end-to-end encryption and access control system for healthcare data. Achieved 100% HIPAA compliance and reduced data breach risk by 95%. Integrated with existing EMR systems seamlessly.', ARRAY['Vue.js', 'Django', 'PostgreSQL', 'Azure', 'Docker'], 'cybersecurity', 'completed', 'MedSecure Inc', NULL, ARRAY['/placeholder.svg'], '2023-11-01', '2024-05-20', true);

INSERT INTO public.blog_posts (title, slug, excerpt, content, author_id, category, tags, is_published, published_at, view_count) VALUES
('The Future of Cybersecurity in 2024', 'future-cybersecurity-2024', 'Exploring emerging threats and defense strategies', 'As we advance into 2024, the cybersecurity landscape continues to evolve at an unprecedented pace. This comprehensive analysis explores the emerging threats, cutting-edge defense strategies, and the technologies that will shape the future of digital security...', (SELECT user_id FROM public.profiles WHERE role = 'admin' LIMIT 1), 'cybersecurity', ARRAY['cybersecurity', 'trends', '2024', 'threats'], true, now(), 1250),
('Building Secure React Applications', 'secure-react-applications', 'Best practices for React security implementation', 'React applications are increasingly becoming targets for cyber attacks. This guide covers essential security practices every React developer should implement, from input validation to secure authentication...', (SELECT user_id FROM public.profiles WHERE role = 'admin' LIMIT 1), 'development', ARRAY['react', 'security', 'javascript', 'best-practices'], true, now(), 890),
('Zero Trust Architecture: Implementation Guide', 'zero-trust-implementation', 'Complete guide to implementing Zero Trust security', 'Zero Trust security models are becoming the gold standard for enterprise security. This comprehensive guide walks through the implementation process, challenges, and benefits...', (SELECT user_id FROM public.profiles WHERE role = 'admin' LIMIT 1), 'cybersecurity', ARRAY['zero-trust', 'enterprise', 'security', 'implementation'], true, now(), 670);