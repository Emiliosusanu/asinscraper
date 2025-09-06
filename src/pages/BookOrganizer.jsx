import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { BookOpen, TrendingUp, Plus, BarChart3, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import BookCard from '@/components/BookCard';
import AddBookModal from '@/components/AddBookModal';
import TrendChart from '@/components/TrendChart';
import StatsOverview from '@/components/StatsOverview';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const BookOrganizer = () => {
  const [books, setBooks] = useState([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);
  const [viewMode, setViewMode] = useState('grid');
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const generateSampleTrendData = () => {
    const data = [];
    const now = new Date();
    for (let i = 59; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      data.push({
        date: date.toISOString().split('T')[0],
        bsr: Math.floor(Math.random() * 50000) + 5000,
        reviews: Math.floor(Math.random() * 10) + (59 - i) * 2
      });
    }
    return data;
  };

  const fetchBooks = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('kdp_tracked_books')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: "Error fetching books",
        description: error.message,
        variant: "destructive",
      });
      setBooks([]);
    } else {
      setBooks(data);
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  const handleAddBook = async (bookData) => {
    if (!user) return;
    const newBook = {
      ...bookData,
      user_id: user.id,
      trend_data: generateSampleTrendData()
    };
    const { data, error } = await supabase
      .from('kdp_tracked_books')
      .insert(newBook)
      .select()
      .single();

    if (error) {
      toast({
        title: "Error adding book",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setBooks(prev => [data, ...prev]);
      toast({
        title: "Book Added Successfully! 📚",
        description: `${data.title} is now being tracked.`,
      });
    }
  };

  const handleDeleteBook = async (bookId) => {
    const { error } = await supabase
      .from('kdp_tracked_books')
      .delete()
      .eq('id', bookId);

    if (error) {
      toast({
        title: "Error deleting book",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setBooks(prev => prev.filter(book => book.id !== bookId));
      toast({
        title: "Book Removed",
        description: "Book has been removed from tracking.",
      });
    }
  };

  const handleRefreshData = async () => {
    toast({
      title: "Refreshing data...",
      description: "Fetching the latest metrics for your books.",
    });
    await fetchBooks();
  };

  const totalBooks = books.length;
  const avgRating = books.length > 0 ? (books.reduce((sum, book) => sum + (book.rating || 0), 0) / books.length).toFixed(1) : 0;
  const totalReviews = books.reduce((sum, book) => sum + (book.review_count || 0), 0);
  const avgBSR = books.length > 0 ? Math.floor(books.reduce((sum, book) => sum + (book.current_bsr || 0), 0) / books.length) : 0;

  return (
    <>
      <Helmet>
        <title>Book Organizer - KDP Performance Tracker</title>
        <meta name="description" content="Organize and track your KDP books. Monitor BSR, reviews, and performance trends." />
      </Helmet>
      
      <div className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <h1 className="text-4xl lg:text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent mb-2">
                Book Organizer
              </h1>
              <p className="text-xl text-gray-300">
                Your KDP Performance Dashboard
              </p>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setViewMode(v => v === 'grid' ? 'chart' : 'grid')} variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                {viewMode === 'grid' ? <BarChart3 className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                {viewMode === 'grid' ? 'Chart View' : 'Grid View'}
              </Button>
              <Button onClick={handleRefreshData} variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <TrendingUp className="w-4 h-4 mr-2" />}
                Refresh Data
              </Button>
              <Button onClick={() => setIsAddModalOpen(true)} className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg">
                <Plus className="w-4 h-4 mr-2" />
                Add Book
              </Button>
            </div>
          </div>
        </motion.div>

        <StatsOverview totalBooks={totalBooks} avgRating={avgRating} totalReviews={totalReviews} avgBSR={avgBSR} />

        {isLoading ? (
          <div className="flex justify-center items-center py-16">
            <Loader2 className="w-16 h-16 text-white animate-spin" />
          </div>
        ) : viewMode === 'grid' ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {books.map((book, index) => (
              <motion.div key={book.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}>
                <BookCard book={book} onDelete={handleDeleteBook} onViewChart={() => setSelectedBook(book)} />
              </motion.div>
            ))}
            {books.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full text-center py-16">
                <BookOpen className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                <h3 className="text-2xl font-semibold text-gray-300 mb-2">No Books Tracked Yet</h3>
                <p className="text-gray-400 mb-6">Start tracking your KDP books to monitor their performance</p>
                <Button onClick={() => setIsAddModalOpen(true)} className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Book
                </Button>
              </motion.div>
            )}
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            {books.map((book, index) => (
              <motion.div key={book.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}>
                <TrendChart book={book} />
              </motion.div>
            ))}
          </motion.div>
        )}

        {selectedBook && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedBook(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">{selectedBook.title}</h2>
                <Button onClick={() => setSelectedBook(null)} variant="ghost" className="text-gray-400 hover:text-white">✕</Button>
              </div>
              <TrendChart book={selectedBook} detailed />
            </motion.div>
          </motion.div>
        )}
      </div>

      <AddBookModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onAdd={handleAddBook} />
    </>
  );
};

export default BookOrganizer;