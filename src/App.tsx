import { useState, useEffect, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, Flame, Users, MapPin, 
  Mic, CheckCircle, XCircle, Clock, 
  Shield, User, Bell 
} from 'lucide-react';
import supabase from './lib/supabase';

interface Incident {
  id: string;
  incident_type: string;
  status: string;
  severity: string;
  room_number: string;
  floor_number: number;
  description: string;
  triggered_by: string;
  affected_count: number;
  created_at: string;
}

interface Alert {
  id: string;
  guest_name: string;
  message: string;
  incident_type: string;
  priority: string;
  created_at: string;
  incident_id?: string;
}

interface Task {
  id: string;
  assigned_to: string;
  task_description: string;
  status: string;
  created_at: string;
}

type Role = 'manager' | 'staff' | 'guest';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-red-500 border-red-500',
  high: 'text-orange-500 border-orange-500',
  medium: 'text-yellow-500 border-yellow-500',
  low: 'text-blue-500 border-blue-500',
};

const ROLE_OPTIONS: Array<{
  id: Role;
  label: string;
  helper: string;
  Icon: typeof Shield;
}> = [
  { id: 'guest', label: 'Guest', helper: 'Request help in seconds', Icon: User },
  { id: 'staff', label: 'Staff', helper: 'Coordinate response', Icon: Users },
  { id: 'manager', label: 'Manager', helper: 'Command center view', Icon: Shield },
];

const ROLE_LABELS: Record<Role, string> = {
  guest: 'Guest',
  staff: 'Staff',
  manager: 'Management',
};

const ROLE_BADGE: Record<Role, string> = {
  guest: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  staff: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  manager: 'bg-red-500/15 text-red-300 border-red-500/30',
};

const AUTH_STORAGE_KEY = 'rapid_auth';

const isRole = (value: unknown): value is Role => {
  return typeof value === 'string' && ['manager', 'staff', 'guest'].includes(value);
};

function App() {
  const [currentRole, setCurrentRole] = useState<Role>('guest');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authRole, setAuthRole] = useState<Role>('guest');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirm, setAuthConfirm] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPanicModal, setShowPanicModal] = useState(false);
  const [panicMessage, setPanicMessage] = useState('');
  const [selectedType, setSelectedType] = useState('fire');
  const [isRecording, setIsRecording] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [property, setProperty] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    let isMounted = true;

    const hydrateFromSession = async () => {
      if (supabase) {
        const { data, error } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (error) {
          console.error('Auth session error:', error);
        }

        const session = data.session;
        if (session?.user) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          const metadataRole = session.user.user_metadata?.role;
          const resolvedRole = isRole(metadataRole) ? metadataRole : 'staff';
          const name =
            typeof session.user.user_metadata?.name === 'string'
              ? session.user.user_metadata.name
              : session.user.email?.split('@')[0] ?? '';

          setIsAuthenticated(true);
          setCurrentRole(resolvedRole);
          setAuthRole(resolvedRole);
          setDisplayName(name);
          setAuthEmail(session.user.email ?? '');
          return;
        }
      }

      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!stored) return;

      try {
        const parsed = JSON.parse(stored) as { role?: string; name?: string };
        if (isRole(parsed.role)) {
          setIsAuthenticated(true);
          setCurrentRole(parsed.role);
          setAuthRole(parsed.role);
          setDisplayName(typeof parsed.name === 'string' ? parsed.name : '');
        }
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    };

    hydrateFromSession();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        const metadataRole = session.user.user_metadata?.role;
        const resolvedRole = isRole(metadataRole) ? metadataRole : 'staff';
        const name =
          typeof session.user.user_metadata?.name === 'string'
            ? session.user.user_metadata.name
            : session.user.email?.split('@')[0] ?? '';

        setIsAuthenticated(true);
        setCurrentRole(resolvedRole);
        setAuthRole(resolvedRole);
        setDisplayName(name);
        setAuthEmail(session.user.email ?? '');
        return;
      }

      setIsAuthenticated(false);
      setDisplayName('');
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    setActiveTab('overview');
  }, [currentRole, isAuthenticated]);

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const needsCredentials = authRole !== 'guest';
    if (!needsCredentials) {
      handleGuestContinue();
      return;
    }

    if (authMode === 'signup' && needsCredentials && !authName.trim()) {
      setAuthError('Full name is required for staff or management accounts.');
      return;
    }
    if (needsCredentials && !authEmail.trim()) {
      setAuthError('Email is required for staff or management.');
      return;
    }
    if (needsCredentials && !authPassword.trim()) {
      setAuthError('Password is required.');
      return;
    }
    if (authMode === 'signup' && authPassword !== authConfirm) {
      setAuthError('Passwords do not match.');
      return;
    }

    setAuthError('');
    setAuthLoading(true);

    if (!supabase) {
      const emailPrefix = authEmail.includes('@') ? authEmail.split('@')[0] : authEmail;
      const derivedName = authName.trim() || emailPrefix || (authRole === 'guest' ? 'Guest' : 'Operator');

      setIsAuthenticated(true);
      setCurrentRole(authRole);
      setDisplayName(derivedName);
      setActiveTab('overview');
      setAuthPassword('');
      setAuthConfirm('');

      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ role: authRole, name: derivedName, email: authEmail })
      );
      setAuthLoading(false);
      return;
    }

    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: {
            data: {
              role: authRole,
              name: authName.trim(),
            },
          },
        });

        if (error) {
          setAuthError(error.message);
          return;
        }

        if (!data.session) {
          setAuthError('Check your email to confirm your account, then sign in.');
          return;
        }

        const metadataRole = data.user?.user_metadata?.role;
        const resolvedRole = isRole(metadataRole) ? metadataRole : authRole;
        const name =
          typeof data.user?.user_metadata?.name === 'string'
            ? data.user?.user_metadata.name
            : authName.trim() || authEmail.split('@')[0];

        setIsAuthenticated(true);
        setCurrentRole(resolvedRole);
        setAuthRole(resolvedRole);
        setDisplayName(name);
        setActiveTab('overview');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });

        if (error) {
          setAuthError(error.message);
          return;
        }

        const metadataRole = data.user?.user_metadata?.role;
        const resolvedRole = isRole(metadataRole) ? metadataRole : authRole;
        const name =
          typeof data.user?.user_metadata?.name === 'string'
            ? data.user?.user_metadata.name
            : data.user?.email?.split('@')[0] ?? 'Operator';

        setIsAuthenticated(true);
        setCurrentRole(resolvedRole);
        setAuthRole(resolvedRole);
        setDisplayName(name);
        setActiveTab('overview');
      }

      setAuthPassword('');
      setAuthConfirm('');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGuestContinue = () => {
    const guestName = authName.trim() || 'Guest';
    setAuthError('');
    setIsAuthenticated(true);
    setCurrentRole('guest');
    setAuthRole('guest');
    setDisplayName(guestName);
    setActiveTab('overview');

    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ role: 'guest', name: guestName })
    );
  };

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setIsAuthenticated(false);
    setCurrentRole('guest');
    setAuthRole('guest');
    setAuthMode('login');
    setDisplayName('');
    setAuthName('');
    setAuthEmail('');
    setAuthPassword('');
    setAuthConfirm('');
    setAuthError('');
    setSelectedIncident(null);
    setShowPanicModal(false);
    setActiveTab('overview');
  };

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    try {
      if (supabase) {
        // Fetch property
        const { data: propData } = await supabase
          .from('properties')
          .select('*')
          .single();
        setProperty(propData);

        // Fetch incidents
        const { data: incData } = await supabase
          .from('incidents')
          .select('*')
          .order('created_at', { ascending: false });
        setIncidents(incData || []);

        // Fetch alerts
        const { data: alertData } = await supabase
          .from('alerts')
          .select('*')
          .order('created_at', { ascending: false });
        setAlerts(alertData || []);

        // Fetch tasks
        const { data: taskData } = await supabase
          .from('tasks')
          .select('*')
          .order('created_at', { ascending: false });
        setTasks(taskData || []);
      } else {
        // Use mock data when Supabase is not configured
        setProperty({ name: 'Grand Plaza Hotel', id: '1' });
        setIncidents([
          {
            id: '1',
            incident_type: 'fire',
            status: 'active',
            severity: 'critical',
            room_number: '305',
            floor_number: 3,
            description: 'Fire alarm triggered in room 305',
            triggered_by: 'guest',
            affected_count: 2,
            created_at: new Date().toISOString(),
          }
        ]);
        setAlerts([
          {
            id: '1',
            guest_name: 'John Doe',
            message: 'There is smoke everywhere!',
            incident_type: 'fire',
            priority: 'CRITICAL',
            created_at: new Date().toISOString(),
            incident_id: '1',
          }
        ]);
        setTasks([
          {
            id: '1',
            assigned_to: 'Security Team',
            task_description: 'Evacuate floor and secure area',
            status: 'pending',
            created_at: new Date().toISOString(),
          }
        ]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      // Fallback to mock data on error
      setProperty({ name: 'Grand Plaza Hotel', id: '1' });
      setIncidents([
        {
          id: '1',
          incident_type: 'fire',
          status: 'active',
          severity: 'critical',
          room_number: '305',
          floor_number: 3,
          description: 'Fire alarm triggered in room 305',
          triggered_by: 'guest',
          affected_count: 2,
          created_at: new Date().toISOString(),
        }
      ]);
      setAlerts([]);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchData();

    // Poll for updates every 8 seconds
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const triggerPanic = async () => {
    if (!panicMessage.trim()) return;

    if (supabase) {
      const newIncident = {
        property_id: property?.id,
        incident_type: selectedType,
        severity: selectedType === 'fire' ? 'critical' : 'high',
        room_number: '305',
        floor_number: 3,
        description: panicMessage,
        triggered_by: 'guest',
        affected_count: Math.floor(Math.random() * 3) + 1,
      };

      const { data: incData, error } = await supabase
        .from('incidents')
        .insert(newIncident)
        .select()
        .single();

      if (error) {
        console.error(error);
        return;
      }

      // Create alert
      const analysisResult = {
        danger: selectedType === 'fire' ? 'high' : 'medium',
        immobile: panicMessage.toLowerCase().includes('can\'t move') || panicMessage.toLowerCase().includes('stuck'),
        panic: true,
        fire_detected: selectedType === 'fire'
      };

      const newAlert = {
        incident_id: incData.id,
        guest_name: 'Current Guest',
        message: panicMessage,
        incident_type: selectedType,
        priority: analysisResult.immobile && selectedType === 'fire' ? 'CRITICAL' : 'HIGH',
        analysis: JSON.stringify(analysisResult)
      };

      await supabase.from('alerts').insert(newAlert);

      // Create a task
      await supabase.from('tasks').insert({
        incident_id: incData.id,
        assigned_to: 'Response Team',
        task_description: `Investigate ${selectedType} alert in room ${newIncident.room_number}`,
        status: 'pending'
      });

      setShowPanicModal(false);
      setPanicMessage('');
      setAnalysis(analysisResult);
      fetchData();

      // Show success toast
      alert('Emergency alert triggered! Response team has been notified.');
    } else {
      // Mock panic trigger
      setShowPanicModal(false);
      setPanicMessage('');
      setAnalysis({
        danger: selectedType === 'fire' ? 'high' : 'medium',
        immobile: panicMessage.toLowerCase().includes('can\'t move') || panicMessage.toLowerCase().includes('stuck'),
        panic: true,
        fire_detected: selectedType === 'fire'
      });
      alert('Emergency alert triggered! (Demo mode - no data saved)');
    }
  };

  const simulateVoiceAnalysis = () => {
    setIsRecording(true);
    
    setTimeout(() => {
      setIsRecording(false);
      
      const sampleMessages = [
        "Help! There's smoke everywhere and I can't see the exit!",
        "My leg is stuck under debris, please send help immediately.",
        "There's a fire on the balcony. My kids are scared.",
        "Medical emergency. Guest is unconscious in the bathroom."
      ];
      
      const randomMsg = sampleMessages[Math.floor(Math.random() * sampleMessages.length)];
      setPanicMessage(randomMsg);
      
      const simAnalysis = {
        danger: 'high',
        immobile: randomMsg.includes('stuck') || randomMsg.includes('leg'),
        panic: true,
        fire_detected: randomMsg.includes('smoke') || randomMsg.includes('fire')
      };
      
      setAnalysis(simAnalysis);
      
    }, 1850);
  };

  const updateIncidentStatus = async (id: string, newStatus: string) => {
    if (supabase) {
      await supabase
        .from('incidents')
        .update({
          status: newStatus,
          resolved_at: newStatus === 'resolved' ? new Date().toISOString() : null
        })
        .eq('id', id);

      fetchData();
    } else {
      // Mock update
      setIncidents(prev => prev.map(inc =>
        inc.id === id ? { ...inc, status: newStatus } : inc
      ));
    }
  };

  const assignTask = async (incidentId: string) => {
    if (supabase) {
      const descriptions = [
        "Evacuate floor and secure area",
        "Provide medical assistance to guests",
        "Clear the path to emergency exit",
        "Coordinate with first responders"
      ];

      await supabase.from('tasks').insert({
        incident_id: incidentId,
        assigned_to: currentRole === 'manager' ? 'Security Lead' : 'Field Officer',
        task_description: descriptions[Math.floor(Math.random() * descriptions.length)],
        status: 'pending'
      });

      fetchData();
    } else {
      // Mock task assignment
      const newTask = {
        id: Date.now().toString(),
        assigned_to: currentRole === 'manager' ? 'Security Lead' : 'Field Officer',
        task_description: "Evacuate floor and secure area",
        status: 'pending',
        created_at: new Date().toISOString(),
      };
      setTasks(prev => [...prev, newTask]);
    }
  };

  const completeTask = async (taskId: string) => {
    if (supabase) {
      await supabase
        .from('tasks')
        .update({ status: 'completed' })
        .eq('id', taskId);

      fetchData();
    } else {
      // Mock task completion
      setTasks(prev => prev.map(task =>
        task.id === taskId ? { ...task, status: 'completed' } : task
      ));
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch(severity) {
      case 'critical': return <Flame className="w-5 h-5 text-red-500" />;
      case 'high': return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      default: return <Bell className="w-5 h-5 text-yellow-500" />;
    }
  };

  const filteredIncidents = incidents.filter(i => 
    currentRole === 'manager' || i.status === 'active'
  );

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute -top-24 left-1/2 h-72 w-[720px] -translate-x-1/2 rounded-full bg-red-600/20 blur-[120px]" />
          <div className="absolute bottom-0 right-0 h-72 w-72 bg-sky-500/10 blur-[120px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_52%)]" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-6 py-12 lg:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-2 rounded-full text-xs uppercase tracking-[0.2em]">
              Crisis Response Platform
            </div>
            <h1 className="text-5xl lg:text-6xl font-semibold tracking-tight mt-6">
              Command your response in seconds.
            </h1>
            <p className="text-zinc-400 text-lg mt-5 max-w-xl">
              Choose your role to access the right tools. Guests get a calm panic interface.
              Staff get live assignments. Management sees the full incident command view.
            </p>

            <div className="mt-10 grid grid-cols-2 gap-4 max-w-md">
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
                <div className="text-xs text-zinc-500 uppercase tracking-widest">Response time</div>
                <div className="text-3xl font-semibold mt-2">90s</div>
                <div className="text-xs text-zinc-500 mt-2">Average dispatch goal</div>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
                <div className="text-xs text-zinc-500 uppercase tracking-widest">System status</div>
                <div className="text-3xl font-semibold mt-2 text-emerald-400">Online</div>
                <div className="text-xs text-zinc-500 mt-2">All channels active</div>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-widest">Access Control</div>
                <div className="text-3xl font-semibold mt-2">RAPID Access</div>
                <div className="text-sm text-zinc-400 mt-1">Sign in or create a role-based session.</div>
              </div>
              <div className="flex bg-zinc-800 rounded-2xl p-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError('');
                  }}
                  disabled={authLoading}
                  className={`px-4 py-2 rounded-xl transition-all ${authMode === 'login' ? 'bg-white text-black' : 'text-zinc-300 hover:text-white'}`}
                >
                  LOGIN
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signup');
                    setAuthError('');
                  }}
                  disabled={authLoading}
                  className={`px-4 py-2 rounded-xl transition-all ${authMode === 'signup' ? 'bg-white text-black' : 'text-zinc-300 hover:text-white'}`}
                >
                  SIGN UP
                </button>
              </div>
            </div>

            <div className="mt-7">
              <div className="text-xs uppercase tracking-widest text-zinc-500">Choose role</div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                {ROLE_OPTIONS.map(({ id, label, helper, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setAuthRole(id);
                      setAuthError('');
                    }}
                    disabled={authLoading}
                    className={`rounded-2xl border px-3 py-4 text-left transition-all ${
                      authRole === id
                        ? 'border-red-500/60 bg-red-500/10'
                        : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
                    }`}
                  >
                    <Icon className="w-5 h-5 mb-3" />
                    <div className="text-sm font-semibold">{label}</div>
                    <div className="text-[10px] text-zinc-500 mt-1">{helper}</div>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleAuthSubmit} className="mt-6 space-y-4">
              {authMode === 'signup' && (
                <div>
                  <label className="text-xs text-zinc-400 uppercase tracking-widest">Full name</label>
                  <input
                    type="text"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="Ava Martinez"
                    className="mt-2 w-full rounded-2xl bg-black border border-zinc-700 px-4 py-3 text-sm focus:border-red-500 focus:outline-none"
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-zinc-400 uppercase tracking-widest">Email</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="name@hotel.com"
                  className="mt-2 w-full rounded-2xl bg-black border border-zinc-700 px-4 py-3 text-sm focus:border-red-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 uppercase tracking-widest">Password</label>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-2 w-full rounded-2xl bg-black border border-zinc-700 px-4 py-3 text-sm focus:border-red-500 focus:outline-none"
                />
              </div>
              {authMode === 'signup' && (
                <div>
                  <label className="text-xs text-zinc-400 uppercase tracking-widest">Confirm password</label>
                  <input
                    type="password"
                    value={authConfirm}
                    onChange={(e) => setAuthConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="mt-2 w-full rounded-2xl bg-black border border-zinc-700 px-4 py-3 text-sm focus:border-red-500 focus:outline-none"
                  />
                </div>
              )}

              {authError && (
                <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full rounded-2xl bg-red-600 py-4 text-sm font-semibold hover:bg-red-500 transition-all disabled:cursor-not-allowed disabled:opacity-70"
              >
                {authLoading ? (authMode === 'signup' ? 'Creating Access...' : 'Signing In...') : authMode === 'signup' ? 'Create Access' : 'Sign In'}
              </button>

              {authRole === 'guest' && (
                <button
                  type="button"
                  onClick={handleGuestContinue}
                  disabled={authLoading}
                  className="w-full rounded-2xl border border-zinc-700 py-3.5 text-sm text-zinc-200 hover:bg-zinc-800 transition-all disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Continue as Guest
                </button>
              )}
            </form>

            <div className="mt-6 text-xs text-zinc-500">
              {authMode === 'login'
                ? 'Need management access? Switch to sign up and choose Management.'
                : 'Already assigned? Switch to login to continue.'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Top Navigation */}
      <nav className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-red-600 rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-2xl tracking-tighter">RAPID</div>
                <div className="text-[10px] text-red-400 -mt-1">CRISIS RESPONSE</div>
              </div>
            </div>
            
            {property && (
              <div className="ml-8 text-sm">
                <div className="font-mono text-zinc-400 text-xs">PROPERTY</div>
                <div className="font-semibold">{property.name}</div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Signed in as</div>
              <div className="text-sm font-semibold">
                {displayName || ROLE_LABELS[currentRole]}
              </div>
            </div>
            <div className={`px-3 py-1.5 rounded-2xl text-[10px] uppercase tracking-widest border ${ROLE_BADGE[currentRole]}`}>
              {ROLE_LABELS[currentRole]}
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-2xl text-xs border border-zinc-700 hover:bg-zinc-800 transition-all"
            >
              LOG OUT
            </button>
          </div>
        </div>

        {/* Secondary Nav */}
        <div className="max-w-7xl mx-auto px-6 border-t border-zinc-800">
          <div className="flex text-sm">
            {currentRole === 'manager' && (
              <>
                <button onClick={() => setActiveTab('overview')} className={`px-8 py-4 border-b-2 transition-colors ${activeTab === 'overview' ? 'border-red-500 text-white' : 'border-transparent text-zinc-400 hover:text-white'}`}>OVERVIEW</button>
                <button onClick={() => setActiveTab('incidents')} className={`px-8 py-4 border-b-2 transition-colors ${activeTab === 'incidents' ? 'border-red-500 text-white' : 'border-transparent text-zinc-400 hover:text-white'}`}>INCIDENTS</button>
                <button onClick={() => setActiveTab('tasks')} className={`px-8 py-4 border-b-2 transition-colors ${activeTab === 'tasks' ? 'border-red-500 text-white' : 'border-transparent text-zinc-400 hover:text-white'}`}>TASKS</button>
              </>
            )}
            
            {(currentRole === 'staff' || currentRole === 'guest') && (
              <button onClick={() => setActiveTab('overview')} className={`px-8 py-4 border-b-2 border-red-500 text-white`}>LIVE DASHBOARD</button>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {loading && incidents.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <>
            {/* GUEST VIEW */}
            {currentRole === 'guest' && (
              <div className="max-w-3xl mx-auto">
                <div className="mb-8 text-center">
                  <div className="inline-flex items-center gap-2 bg-red-500/10 text-red-400 px-4 py-1 rounded-full text-sm mb-3">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    GRAND PLAZA HOTEL • FLOOR 3 • ROOM 305
                  </div>
                  <h1 className="text-5xl font-bold tracking-tighter mb-3">Emergency Ready</h1>
                  <p className="text-zinc-400 max-w-md mx-auto">In case of emergency, use the large red button below. Help is 90 seconds away.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                  {/* BIG PANIC BUTTON */}
                  <div className="lg:col-span-3">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowPanicModal(true)}
                      className="w-full h-[380px] bg-gradient-to-br from-red-600 via-red-700 to-red-800 rounded-3xl flex flex-col items-center justify-center gap-6 relative overflow-hidden group shadow-2xl shadow-red-900/50"
                    >
                      <div className="absolute inset-0 bg-[radial-gradient(#fff_0.8px,transparent_1px)] [background-size:6px_6px] opacity-10"></div>
                      
                      <AlertTriangle className="w-24 h-24 text-white animate-pulse" />
                      <div>
                        <div className="text-5xl font-bold tracking-[-2px]">PANIC</div>
                        <div className="text-red-200 text-xl -mt-2">BUTTON</div>
                      </div>
                      <div className="text-sm text-red-200/70 max-w-[210px] text-center">Press to immediately notify response team and security</div>
                      
                      <div className="absolute bottom-8 text-[10px] tracking-[3px] font-mono text-red-200/40">EMERGENCY PROTOCOL ACTIVATED</div>
                    </motion.button>
                  </div>

                  {/* SIDE INFO */}
                  <div className="lg:col-span-2 space-y-6">
                    <div className="bg-zinc-900 rounded-3xl p-8">
                      <div className="flex justify-between items-start mb-8">
                        <div>
                          <div className="uppercase text-xs tracking-widest text-zinc-500">CURRENT STATUS</div>
                          <div className="text-emerald-400 text-4xl font-semibold mt-1">SAFE</div>
                        </div>
                        <CheckCircle className="w-10 h-10 text-emerald-400" />
                      </div>
                      
                      <div className="space-y-6">
                        <div className="flex items-center gap-4">
                          <div className="w-9 h-9 rounded-2xl bg-zinc-800 flex items-center justify-center">
                            <MapPin className="w-4 h-4" />
                          </div>
                          <div className="text-sm">
                            <div>Room 305 • Floor 3</div>
                            <div className="text-xs text-zinc-500">Nearest exit: 40ft</div>
                          </div>
                        </div>
                        
                        <button 
                          onClick={simulateVoiceAnalysis}
                          className="w-full h-14 bg-zinc-800 hover:bg-zinc-700 transition-colors rounded-2xl flex items-center justify-center gap-3 text-sm font-medium"
                        >
                          <Mic className="w-5 h-5" /> 
                          {isRecording ? "LISTENING..." : "RECORD VOICE MESSAGE"}
                        </button>
                      </div>
                    </div>

                    {/* ESCAPE ROUTE */}
                    <div className="bg-zinc-900 rounded-3xl p-6">
                      <div className="flex justify-between mb-4">
                        <div className="text-sm font-medium">ESCAPE ROUTE</div>
                        <div className="text-xs px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full">3 MIN AWAY</div>
                      </div>
                      
                      <div className="relative h-52 bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800 flex items-center justify-center">
                        <img 
                          src="/floor-plan.svg" 
                          alt="Floor Plan" 
                          className="w-full h-full object-contain opacity-70"
                        />
                        <motion.div 
                          animate={{ 
                            x: [40, 120, 190],
                            y: [80, 105, 150]
                          }}
                          transition={{ duration: 3.5, repeat: Infinity }}
                          className="absolute w-4 h-4 bg-red-500 rounded-full shadow-[0_0_20px_#ef4444]"
                        />
                        <div className="absolute bottom-4 right-4 bg-black/70 text-[10px] px-3 py-1 rounded font-mono">EXIT B</div>
                      </div>
                    </div>
                  </div>
                </div>

                {analysis && (
                  <div className="mt-8 bg-zinc-900 border border-zinc-700 rounded-3xl p-7">
                    <div className="uppercase text-xs mb-4 tracking-widest text-zinc-400">VOICE ANALYSIS RESULT</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-black/40 p-5 rounded-2xl">
                        <div className="text-xs text-zinc-400">DANGER LEVEL</div>
                        <div className={`text-5xl font-semibold mt-2 ${analysis.fire_detected ? 'text-red-400' : 'text-orange-400'}`}>
                          {analysis.danger.toUpperCase()}
                        </div>
                      </div>
                      <div className="bg-black/40 p-5 rounded-2xl">
                        <div className="text-xs text-zinc-400">KEY DETECTIONS</div>
                        <div className="flex flex-wrap gap-2 mt-4">
                          {analysis.fire_detected && <div className="px-4 py-1 bg-red-500/10 text-red-400 text-xs rounded-full">FIRE DETECTED</div>}
                          {analysis.immobile && <div className="px-4 py-1 bg-orange-500/10 text-orange-400 text-xs rounded-full">IMMOBILE GUEST</div>}
                          <div className="px-4 py-1 bg-yellow-500/10 text-yellow-400 text-xs rounded-full">HIGH PANIC</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* MANAGER + STAFF SHARED VIEW */}
            {(currentRole === 'manager' || currentRole === 'staff') && (
              <>
                {/* STATS BAR */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                  <div className="bg-zinc-900 rounded-3xl p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs tracking-widest text-zinc-500">ACTIVE INCIDENTS</div>
                        <div className="text-5xl font-semibold text-red-400 mt-3">{incidents.filter(i => i.status === 'active').length}</div>
                      </div>
                      <Flame className="w-10 h-10 text-red-500/70" />
                    </div>
                  </div>
                  
                  <div className="bg-zinc-900 rounded-3xl p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs tracking-widest text-zinc-500">GUESTS AT RISK</div>
                        <div className="text-5xl font-semibold text-orange-400 mt-3">
                          {incidents.reduce((sum, i) => sum + i.affected_count, 0)}
                        </div>
                      </div>
                      <Users className="w-10 h-10 text-orange-500/70" />
                    </div>
                  </div>
                  
                  <div className="bg-zinc-900 rounded-3xl p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs tracking-widest text-zinc-500">AVG RESPONSE</div>
                        <div className="text-5xl font-semibold text-emerald-400 mt-3">87s</div>
                      </div>
                      <Clock className="w-10 h-10 text-emerald-500/70" />
                    </div>
                  </div>
                  
                  <div className="bg-zinc-900 rounded-3xl p-6 relative overflow-hidden">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs tracking-widest text-zinc-500">ON SITE STAFF</div>
                        <div className="text-5xl font-semibold text-sky-400 mt-3">14</div>
                      </div>
                      <Shield className="w-10 h-10 text-sky-500/70" />
                    </div>
                    <div className="absolute -bottom-6 -right-6 text-[120px] font-black text-sky-900/30">OK</div>
                  </div>
                </div>

                {activeTab === 'overview' && (
                  <div className="grid grid-cols-12 gap-6">
                    {/* Live Incidents */}
                    <div className="col-span-12 lg:col-span-7">
                      <div className="flex items-center justify-between mb-5 px-1">
                        <div className="font-semibold text-lg">Active Incidents</div>
                        <button 
                          onClick={() => setActiveTab('incidents')}
                          className="text-xs text-zinc-400 hover:text-white flex items-center gap-1"
                        >
                          VIEW ALL <span className="text-lg leading-none">→</span>
                        </button>
                      </div>
                      
                      <div className="space-y-4">
                        <AnimatePresence>
                          {filteredIncidents.slice(0, 4).map((incident, idx) => (
                            <motion.div
                              key={incident.id}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.03 }}
                              onClick={() => setSelectedIncident(incident)}
                              className="bg-zinc-900 hover:bg-zinc-800/90 border border-zinc-800 rounded-3xl p-6 cursor-pointer transition-all group flex gap-6"
                            >
                              <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex-shrink-0 flex items-center justify-center">
                                {getSeverityIcon(incident.severity)}
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between">
                                  <div>
                                    <span className={`inline-block text-xs font-mono px-3 py-px rounded-full border ${SEVERITY_COLORS[incident.severity] || ''}`}>
                                      {incident.severity.toUpperCase()}
                                    </span>
                                    <span className="ml-3 text-xs text-zinc-500 font-mono">ROOM {incident.room_number}</span>
                                  </div>
                                  <div className="text-xs text-right text-zinc-500">
                                    {new Date(incident.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                  </div>
                                </div>
                                
                                <div className="mt-2 font-medium text-lg leading-none">{incident.description}</div>
                                
                                <div className="flex items-center gap-4 text-xs mt-5">
                                  <div className="flex items-center gap-1.5">
                                    <div className={`w-2 h-2 rounded-full ${incident.status === 'active' ? 'bg-red-500 animate-pulse' : 'bg-emerald-400'}`}></div>
                                    <span>{incident.status.toUpperCase()}</span>
                                  </div>
                                  <div className="text-zinc-500">•</div>
                                  <div>{incident.affected_count} GUESTS AFFECTED</div>
                                </div>
                              </div>
                              
                              <button 
                                onClick={(e) => { e.stopPropagation(); updateIncidentStatus(incident.id, incident.status === 'active' ? 'resolved' : 'active'); }}
                                className="self-center text-xs px-5 py-3 bg-zinc-800 hover:bg-white hover:text-black transition-all rounded-2xl"
                              >
                                {incident.status === 'active' ? 'RESOLVE' : 'REOPEN'}
                              </button>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>

                    {/* Right Sidebar */}
                    <div className="col-span-12 lg:col-span-5 space-y-6">
                      {/* FLOOR PLAN */}
                      <div className="bg-zinc-900 rounded-3xl p-6">
                        <div className="flex justify-between items-center mb-4">
                          <div className="font-medium">FLOOR 3 LIVE VIEW</div>
                          <div className="px-4 py-1 text-xs bg-red-500/10 text-red-400 rounded-3xl">3 GUESTS HERE</div>
                        </div>
                        
                        <div className="relative rounded-3xl overflow-hidden border border-zinc-700 bg-black h-80 flex items-center justify-center">
                          <img src="/floor-plan.svg" alt="Hotel Floor Plan" className="max-h-full opacity-75" />
                          
                          {/* Simulated markers */}
                          <motion.div 
                            animate={{ scale: [1, 1.6, 1] }}
                            transition={{ repeat: Infinity, duration: 2.2 }}
                            className="absolute left-[38%] top-[32%] w-5 h-5 border-2 border-red-500 rounded-full"
                          />
                          <div className="absolute left-[38%] top-[32%] w-2 h-2 bg-red-500 rounded-full" />
                          
                          <motion.div 
                            animate={{ scale: [1, 1.8, 1] }}
                            transition={{ repeat: Infinity, duration: 3.1, delay: 0.6 }}
                            className="absolute left-[65%] top-[55%] w-5 h-5 border-2 border-orange-400 rounded-full"
                          />
                        </div>
                      </div>

                      {/* Recent Alerts */}
                      <div className="bg-zinc-900 rounded-3xl overflow-hidden">
                        <div className="px-6 py-5 border-b border-zinc-800 flex justify-between text-sm">
                          <div>RECENT GUEST ALERTS</div>
                          <div className="text-red-400 text-xs flex items-center">LIVE</div>
                        </div>
                        
                        <div className="divide-y divide-zinc-800 max-h-[300px] overflow-auto">
                          {alerts.slice(0, 5).map((alertItem, index) => (
                            <div key={index} className="px-6 py-5 hover:bg-zinc-800/60 transition-colors flex gap-4 text-sm">
                              <div className={`mt-1 w-5 h-5 flex-shrink-0 rounded-xl flex items-center justify-center ${alertItem.priority === 'CRITICAL' ? 'bg-red-500' : 'bg-orange-500'}`}>
                                <span className="text-[10px] font-bold">!</span>
                              </div>
                              <div className="flex-1">
                                <div className="font-medium">{alertItem.guest_name}</div>
                                <div className="text-xs text-zinc-400 line-clamp-2 mt-0.5">{alertItem.message}</div>
                                <div className="text-[10px] text-zinc-500 mt-2 font-mono">{new Date(alertItem.created_at).toLocaleTimeString()}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'incidents' && (
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-3xl font-semibold tracking-tight">All Incidents</h2>
                      <button 
                        onClick={() => {
                          const types = ['fire','medical','security'];
                          const randomType = types[Math.floor(Math.random()*types.length)] as any;
                          setSelectedType(randomType);
                          setPanicMessage("Manual incident created by management");
                          setShowPanicModal(true);
                        }}
                        className="bg-white text-black px-6 py-3 rounded-2xl text-sm font-medium flex items-center gap-2 hover:bg-zinc-100"
                      >
                        <Flame className="w-4 h-4" /> SIMULATE NEW INCIDENT
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {incidents.map(inc => (
                        <div 
                          key={inc.id} 
                          onClick={() => setSelectedIncident(inc)}
                          className="bg-zinc-900 p-8 rounded-3xl cursor-pointer hover:ring-1 hover:ring-white/30 transition-all"
                        >
                          <div className="flex justify-between">
                            <div className={`font-mono uppercase text-xs tracking-widest px-4 py-1 rounded-3xl border ${SEVERITY_COLORS[inc.severity]}`}>
                              {inc.incident_type} • {inc.severity}
                            </div>
                            <div className="text-xs text-zinc-400">{inc.floor_number}F • RM {inc.room_number}</div>
                          </div>
                          
                          <div className="mt-8 text-2xl font-medium leading-tight pr-12">{inc.description}</div>
                          
                          <div className="mt-12 flex justify-between items-end">
                            <div>
                              <div className="text-xs text-zinc-400">AFFECTED</div>
                              <div className="text-4xl font-semibold text-white/90">{inc.affected_count}</div>
                            </div>
                            
                            <button 
                              onClick={(e) => {e.stopPropagation(); assignTask(inc.id);}}
                              className="text-xs px-7 py-3.5 border border-white/30 hover:bg-white/5 rounded-2xl"
                            >
                              ASSIGN STAFF
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'tasks' && (
                  <div className="bg-zinc-900 rounded-3xl">
                    <div className="p-8 border-b border-zinc-800 flex items-center justify-between">
                      <div className="font-semibold">Field Assignments</div>
                      <div className="text-xs bg-emerald-900 text-emerald-300 px-5 py-2 rounded-3xl">3 ACTIVE</div>
                    </div>
                    
                    <div className="divide-y divide-zinc-800">
                      {tasks.map((task, index) => (
                        <div key={index} className="p-8 flex gap-6 items-center">
                          <div className={`text-xs px-5 py-2 rounded-3xl ${task.status === 'completed' ? 'bg-emerald-900 text-emerald-300' : task.status === 'in_progress' ? 'bg-amber-900 text-amber-400' : 'bg-zinc-800 text-zinc-400'}`}>
                            {task.status.toUpperCase()}
                          </div>
                          
                          <div className="flex-1">
                            <div className="font-medium">{task.task_description}</div>
                            <div className="text-xs text-zinc-500 mt-1">Assigned to: {task.assigned_to}</div>
                          </div>
                          
                          {task.status !== 'completed' && (
                            <button 
                              onClick={() => completeTask(task.id)}
                              className="px-8 py-3 bg-white text-black text-sm rounded-2xl font-medium hover:bg-emerald-400 hover:text-white transition-all"
                            >
                              MARK COMPLETE
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* INCIDENT DETAIL MODAL */}
      <AnimatePresence>
        {selectedIncident && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-6" onClick={() => setSelectedIncident(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.88, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-zinc-900 w-full max-w-2xl rounded-3xl overflow-hidden"
            >
              <div className="px-10 pt-9 pb-6 border-b border-zinc-700">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="uppercase font-mono text-xs tracking-[1px] text-red-400">{selectedIncident.incident_type.toUpperCase()} INCIDENT</div>
                    <div className="text-4xl font-semibold mt-1">Room {selectedIncident.room_number}</div>
                  </div>
                  <button onClick={() => setSelectedIncident(null)} className="text-zinc-400 hover:text-white">
                    <XCircle className="w-8 h-8" />
                  </button>
                </div>
              </div>
              
              <div className="p-10 space-y-8">
                <div>
                  <div className="text-xs text-zinc-400 mb-2">DESCRIPTION</div>
                  <p className="text-lg leading-snug">{selectedIncident.description}</p>
                </div>
                
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-zinc-950 rounded-2xl p-5 text-center">
                    <div className="text-xs text-zinc-400">FLOOR</div>
                    <div className="text-6xl font-light mt-1 text-white/80">{selectedIncident.floor_number}</div>
                  </div>
                  <div className="bg-zinc-950 rounded-2xl p-5 text-center">
                    <div className="text-xs text-zinc-400">SEVERITY</div>
                    <div className="mt-4 text-3xl font-semibold uppercase text-red-400 tracking-widest">{selectedIncident.severity}</div>
                  </div>
                  <div className="bg-zinc-950 rounded-2xl p-5 text-center">
                    <div className="text-xs text-zinc-400">AFFECTED</div>
                    <div className="mt-3 text-6xl font-light text-white/80">{selectedIncident.affected_count}</div>
                  </div>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-xs uppercase tracking-widest text-zinc-400">Associated Alerts</div>
                    <button onClick={() => assignTask(selectedIncident.id)} className="text-xs underline">+ ADD TASK</button>
                  </div>
                  
                  <div className="space-y-3">
                    {alerts.filter(a => a.incident_id === selectedIncident.id || true).slice(0, 3).map((al, i) => (
                      <div key={i} className="bg-black/60 rounded-2xl p-5 text-sm">
                        <div className="flex justify-between text-xs">
                          <div className="text-zinc-400">{al.guest_name}</div>
                          <div>{al.priority}</div>
                        </div>
                        <div className="mt-2 text-zinc-300">{al.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="border-t border-zinc-700 p-4 flex gap-3">
                <button 
                  onClick={() => updateIncidentStatus(selectedIncident.id, 'resolved')}
                  className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 transition-colors rounded-2xl text-sm font-medium"
                >
                  MARK RESOLVED
                </button>
                <button 
                  onClick={() => setSelectedIncident(null)}
                  className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 transition-colors rounded-2xl text-sm font-medium"
                >
                  CLOSE
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PANIC MODAL */}
      <AnimatePresence>
        {showPanicModal && (
          <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-5" onClick={() => setShowPanicModal(false)}>
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              className="bg-zinc-900 w-full max-w-lg rounded-3xl p-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center mb-8">
                <div className="mx-auto w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6">
                  <AlertTriangle className="w-9 h-9 text-red-500" />
                </div>
                <div className="text-3xl font-semibold">Emergency Report</div>
                <div className="text-zinc-400 mt-2">Describe the situation</div>
              </div>

              <div className="flex gap-3 mb-6">
                {['fire', 'medical', 'security'].map(t => (
                  <button 
                    key={t}
                    onClick={() => setSelectedType(t)}
                    className={`flex-1 py-3 text-sm rounded-2xl transition-all ${selectedType === t ? 'bg-red-500 text-white' : 'bg-zinc-800'}`}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>

              <textarea 
                value={panicMessage} 
                onChange={(e) => setPanicMessage(e.target.value)}
                className="w-full h-28 bg-black border border-zinc-700 focus:border-red-500 rounded-3xl p-6 text-sm placeholder:text-zinc-500 resize-y"
                placeholder="There is thick smoke coming out of the vent..."
              ></textarea>

              <div className="flex gap-4 mt-8">
                <button 
                  onClick={simulateVoiceAnalysis}
                  className="flex-1 py-4 border border-zinc-700 hover:bg-zinc-800 rounded-2xl text-sm flex items-center justify-center gap-2"
                >
                  <Mic className="w-4 h-4" /> USE VOICE
                </button>
                <button 
                  onClick={triggerPanic}
                  className="flex-[1.6] py-4 bg-red-600 hover:bg-red-500 rounded-2xl font-semibold text-base active:scale-[0.985] transition-all"
                >
                  SEND ALERT TO COMMAND
                </button>
              </div>
              
              <div className="text-center text-[10px] text-zinc-500 mt-8">All alerts are recorded and reviewed by security</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer status */}
      <div className="fixed bottom-6 right-6 bg-zinc-900 text-zinc-400 text-xs px-5 py-2.5 rounded-3xl border border-zinc-700 font-mono flex items-center gap-2 shadow-2xl">
        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-ping"></div>
        SYSTEM ONLINE • {new Date().toLocaleTimeString()}
      </div>
    </div>
  );
}

export default App;
