import { delay, motion } from 'framer-motion';
import { config } from '../../constants/motionVariant';

function MotionPersonalStatement() {
  return (
    <motion.p
      {...config}
      transition={{ delay: 0.7 }} // Adjust the delay as needed
      className='text-md pb-8 my-4 text-lg md:text-2xl w-full max-w-prose mt-8'
    >
      Fueled by <b className='bg-gradient-to-tr from-green-500 via-green-500 to-blue-500 bg-clip-text text-transparent'>
        curiosity
      </b> and a <b className='bg-gradient-to-tr from-green-500 via-green-500 to-blue-500 bg-clip-text text-transparent'>
        passion for problem-solving
      </b>, I navigate the complexities of technology with a{' '}
      <b className='bg-gradient-to-tr from-green-500 via-green-500 to-blue-500 bg-clip-text text-transparent'>
        creative edge
      </b>. I am committed to building{' '}
      <b className='bg-gradient-to-tr from-green-500 via-green-500 to-blue-500 bg-clip-text text-transparent'>
        innovative solutions
      </b> that enhance user experiences. 🌏✨
    </motion.p>
  );
}
export default MotionPersonalStatement;
