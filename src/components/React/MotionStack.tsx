import { motion } from 'framer-motion';
import { config } from '../../constants/motionScale';
import Spring from '../icons/Spring';
import Nginx from '../icons/Nginx';
import Redis from '../icons/Redis';
import Astro from '../icons/Astro';
import ElasticSearch from '../icons/ElasticSearch';
import Git from '../icons/Git';
import Next from '../icons/Next';
import MongoDB from '../icons/MongoDB';
import Kafka from '../icons/Kafka';
import React from '../icons/React';
import TailwindCss from '../icons/TailwindCss';
import PostgresSQL from '../icons/PostgreSQL';
import RabbitMQ from '../icons/RabbitMQ';
import Firebase from '../icons/Firebase';
import Aws from '../icons/Aws';

export const stack = [
  <Spring />,
  <Nginx />,
  <RabbitMQ />,
  <Kafka />,
  <Redis />,
  <MongoDB />,
  <PostgresSQL />,
  <ElasticSearch />,
  <Firebase />,
  <Aws />,
  <React />,
  <TailwindCss />,
  <Next />,
  <Astro />,
  <Git />
];

function MotionStack() {
  return (
    <>
      {stack.map((tech, index) => (
        <motion.div
          key={index}
          {...config}
          transition={{ delay: 0.55 + index * 0.05 }}
          className='text-xs md:text-xl bg-neutral-300/10 backdrop-blur-sm border border-neutral-300/20 rounded-md p-1 md:p-2 flex items-center place-content-center'
        >
          {tech}
        </motion.div>
      ))}
    </>
  );
}
export default MotionStack;
