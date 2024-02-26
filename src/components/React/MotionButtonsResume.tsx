import { motion } from 'framer-motion';
import { config } from '../../constants/motionVariant';

function MotionButtonsResume() {
return (
    <>
    <motion.a
        href='https://www.hostize.com/zh/v/846i095Zxe/resumejincheng-ma-pdf-jincheng-ma'
        {...config}
        transition={{ type: 'tween', delay: 1 }}
        whileTap={{
            scale: 0.99,
            transition: { duration: 0.05, ease: 'easeOut' }
        }}
        className='p-2 border border-neutral-300/80  hover:text-black hover:bg-green-500 hover:border-green-500 rounded-lg transition-colors ease-in-out font-bold text-2xl font-mono text-center max-w-md w-full md:w-[400px]'
        >
        Resume
    </motion.a>
    </>
);
}
export default MotionButtonsResume;
