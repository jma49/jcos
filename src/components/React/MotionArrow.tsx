import { motion } from 'framer-motion';
import { config } from '../../constants/motionScale';

type Props = {
  children: React.ReactNode;
};

function MotionArrow({ children }: Props) {
  return (
    <motion.span
      {...config}
      transition={{ delay: 1.05 }}
      className='absolute bottom-20'
      id='scroll-hook'
    >
      {children}
    </motion.span>
  );
}
export default MotionArrow;
