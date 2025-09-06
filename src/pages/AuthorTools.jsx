import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Wrench, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import ScrapedBookCard from '@/components/ScrapedBookCard';

const AuthorTools = () => {
  const [asin, setAsin] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedData, setScrapedData] = useState(null);

  const handleScrape = async () => {
    if (!asin.trim()) {
      toast({
        title: 'ASIN Required',
        description: 'Please enter an Amazon ASIN to scrape.',
        variant: 'destructive',
      });
      return;
    }

    setIsScraping(true);
    setScrapedData(null);
    
    const { data, error } = await supabase.functions.invoke('scrape-amazon-product', {
      body: JSON.stringify({ asin: asin.trim() }),
    });

    if (error) {
      toast({
        title: 'Scraping Failed',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Scraping Successful!',
        description: `Successfully fetched data for ASIN: ${asin.trim()}`,
      });
      setScrapedData(data);
    }

    setIsScraping(false);
  };

  return (
    <>
      <Helmet>
        <title>Author Tools - KDP Performance Tracker</title>
        <meta name="description" content="A suite of tools to help KDP authors succeed, including an Amazon product scraper." />
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="container mx-auto"
      >
        <div className="flex items-center gap-4 mb-8">
          <Wrench className="w-10 h-10 text-purple-400" />
          <div>
            <h1 className="text-4xl font-bold text-white">Author Tools</h1>
            <p className="text-lg text-gray-400">Your creative and analytical toolkit.</p>
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-2xl p-8 border border-white/10">
          <h2 className="text-2xl font-semibold text-white mb-6">ASIN Scraper</h2>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <input
              type="text"
              value={asin}
              onChange={(e) => setAsin(e.target.value)}
              placeholder="Enter Amazon ASIN (e.g., B08XYZABC1)"
              className="flex-grow bg-white/10 border border-white/20 rounded-lg text-white px-4 py-3 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <Button onClick={handleScrape} disabled={isScraping} className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg">
              {isScraping ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              {isScraping ? 'Scraping...' : 'Scrape ASIN'}
            </Button>
          </div>
          
          {isScraping && (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="w-12 h-12 text-white animate-spin" />
            </div>
          )}
          
          {scrapedData && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <ScrapedBookCard book={scrapedData} />
            </motion.div>
          )}

        </div>
      </motion.div>
    </>
  );
};

export default AuthorTools;