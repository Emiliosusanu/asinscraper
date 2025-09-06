import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Construction } from 'lucide-react';

const PlaceholderPage = ({ title }) => {
  return (
    <>
      <Helmet>
        <title>{title} - In Costruzione</title>
        <meta name="description" content={`Pagina per ${title} in fase di sviluppo.`} />
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="container mx-auto flex flex-col items-center justify-center h-full text-center"
      >
        <Construction className="w-24 h-24 text-purple-400 mb-8" />
        <h1 className="text-5xl font-bold text-white mb-4">{title}</h1>
        <p className="text-xl text-gray-300 max-w-2xl">
          Questa sezione è in fase di sviluppo. Presto qui troverai potenti strumenti di analisi e stime per ottimizzare le tue performance!
        </p>
      </motion.div>
    </>
  );
};

export default PlaceholderPage;