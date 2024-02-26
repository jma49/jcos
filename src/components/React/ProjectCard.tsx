import { motion } from 'framer-motion';
import { config } from '../../constants/motionProject';
import Code from '../icons/Code';
import External from '../icons/External';
import { stack } from './MotionStack';
import type { ImageMetadata } from 'astro';

type Props = {
  title: string;
  link: {
    live: string;
    github: string;
  };
  image: ImageMetadata;
  index: number;
  children: React.ReactNode;
  stackIndex: number[];
};

function ProjectCard({
  image,
  title,
  link,
  index,
  children,
  stackIndex
}: Props) {
  return (
    <motion.div
      {...config}
      transition={{ delay: index * 0.05 }}
      className='shadow-lg shadow-neutral-200/5 backdrop-blur-sm rounded-lg border border-neutral-200/10 max-w-[350px] md:max-w-xl group relative overflow-hidden'
    >
      <div className='relative overflow-hidden'>
        <img
          src={image.src}
          width={image.width}
          height={image.height}
          className='relative rounded-t-lg object-cover h-full max-h-80'
        />
      </div>
      <div className='p-6 relative text-lg'>
        <a
          href={link.live}
          rel='noopener nofollow'
          target='_blank'
          className='text-2xl md:text-4xl font-bold text-red-500 flex items-center py-0.5 hover:underline'
        >
          {title} <External />
        </a>
        <div className='flex items-center my-2 gap-1'>
          {stackIndex.map((item) => (
            <div
              className='text-xs md:text-xl bg-neutral-300/10 backdrop-blur-sm border border-neutral-300/20 rounded-md p-1 md:p-2 flex items-center place-content-center'
              key={Math.random()}
            >
              {stack[item]}
            </div>
          ))}
        </div>
        <p className='text-sm md:text-base pt-2'>{children}</p>
        <a
          href={link.github}
          className='text-lg font-bold text-red-500 hover:underline flex items-center mt-2'
        >
          <Code />
          Code
        </a>
      </div>
    </motion.div>
  );
}
export default ProjectCard;
