import { motion } from 'framer-motion';
import { config } from '../../constants/motionVariant';

function MotionButtons() {
  return (
    <>
      <motion.a
        href='#social'
        {...config}
        transition={{ type: 'tween', delay: 1 }}
        whileTap={{
          scale: 0.99,
          transition: { duration: 0.05, ease: 'easeOut' }
        }}
        className='p-2 border border-neutral-300/80  hover:text-black hover:bg-red-500 hover:border-red-500 rounded-lg transition-colors ease-in-out font-bold text-2xl font-mono text-center max-w-md'
      >
        Get in touch
      </motion.a>
    </>
  );
}
export default MotionButtons;
