import { motion } from 'framer-motion';
import { config } from '../../constants/motionVariant';

function MotionH1() {
  return (
    <>
      <motion.h1
        {...config}
        className='font-black text-6xl md:text-7xl 2xl:text-8xl bg-gradient-to-tr from-neutral-200 to-neutral-600 bg-clip-text text-transparent'
      >
        Software Developer 
      </motion.h1>
      <motion.small
        {...config}
        transition={{ delay: 0.5 }}
        className='text-lg md:text-xl max-w-prose my-4'
      >
        & Data Analyst 🔍
      </motion.small>
    </>
  );
}
export default MotionH1;
