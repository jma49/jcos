import { motion } from 'framer-motion';
import { config } from '../../constants/motionVariant';

type Props = {
  openForm: React.Dispatch<React.SetStateAction<boolean>>;
};

function Message({ openForm }: Props) {
  return (
    <motion.button
      {...config}
      onClick={() => openForm(true)}
      whileTap={{
        scale: 0.99,
        transition: { duration: 0.05, ease: 'easeOut' }
      }}
      className='border group border-neutral-200/20 transition-colors hover:border-transparent overflow-hidden max-w-md p-2 w-full h-16 flex items-center text-x; font-bold rounded-md relative mt-10'
    >
      <span className='z-30 relative flex gap-2 text-neutral-500 group-hover:text-red-500 transition-colors ease-in-out items-center'>
        <svg
          xmlns='http://www.w3.org/2000/svg'
          fill='none'
          viewBox='0 0 24 24'
          strokeWidth={1.5}
          stroke='currentColor'
          className='w-8 h-8 text-neutral-500 group-hover:text-red-500 transition-colors ease-out'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            d='M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155'
          />
        </svg>
        Send Direct Message
      </span>{' '}
      <span className='absolute inset-0 bg-gradient-to-tr opacity-0 group-hover:opacity-100 from-gray-200/20 to-transparent z-20 transition-opacity duration-200 ease-in-out backdrop-blur-[1px]'></span>
    </motion.button>
  );
}
export default Message;
