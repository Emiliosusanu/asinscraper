import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Loader2, LogIn, UserPlus, Bot } from 'lucide-react';
const Login = () => {
  const {
    signIn,
    signUp
  } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoginView, setIsLoginView] = useState(true);
  const handleSubmit = async e => {
    e.preventDefault();
    setIsSubmitting(true);
    if (isLoginView) {
      await signIn(email, password);
    } else {
      await signUp(email, password);
    }
    setIsSubmitting(false);
  };
  return <>
      <Helmet>
        <title>{isLoginView ? 'Login' : 'Sign Up'} - ASIN-SaaS</title>
      </Helmet>
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div initial={{
        opacity: 0,
        y: -20
      }} animate={{
        opacity: 1,
        y: 0
      }} className="w-full max-w-md p-8 space-y-8 glass-card">
          <div className="text-center">
            <Bot className="w-16 h-16 mx-auto text-primary mb-4" />
            <h1 className="text-4xl font-bold gradient-text">
              {isLoginView ? 'Welcome Back!' : 'Create Account'}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {isLoginView ? 'Sign in to access your dashboard.' : 'Get started with your KDP tracker.'}
            </p>
          </div>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-muted-foreground">Email Adress</label>
              <div className="mt-1">
                <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 glass-input" />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-muted-foreground">
                Password
              </label>
              <div className="mt-1">
                <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full px-3 py-2 glass-input" />
              </div>
            </div>
            <div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : isLoginView ? <LogIn className="mr-2 h-4 w-4" /> : <UserPlus className="mr-2 h-4 w-4" />}
                {isSubmitting ? 'Processing...' : isLoginView ? 'Sign In' : 'Sign Up'}
              </Button>
            </div>
          </form>
          <div className="text-center">
            <button onClick={() => setIsLoginView(!isLoginView)} className="text-sm text-primary/80 hover:text-primary">
              {isLoginView ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
            </button>
          </div>
        </motion.div>
      </div>
    </>;
};
export default Login;