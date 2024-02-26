import Discord from '../icons/Discord';
import Github from '../icons/Github';
import Linkedin from '../icons/Linkedin';
import Message from '../icons/Message';
import Telegram from '../icons/Telegram';
import Twitter from '../icons/Twitter';
import ContactLink from './ContactLink';

const socialNames = [
  'LinkedIn',
  'GitHub',
  'X/Twitter',
  'Telegram',
  'Discord'
  // 'Send Direct Message'
];

const socialIcons = [
  <Linkedin />,
  <Github />,
  <Twitter />,
  <Telegram />,
  <Discord />
  // <Message />
];

const socialLinks = [
  'https://www.linkedin.com/in/jincheng-ma-iit',
  'https://github.com/jma49/',
  'https://twitter.com/MaJonson357019',
  'https://t.me/jma49',
  'https://discord.gg/pb4jAxXA'
];

function SocialLinks() {
  return (
    <>
      {socialNames.map((name, index) => (
        <ContactLink key={index} href={socialLinks[index]}>
          {socialIcons[index]}
          {name}
        </ContactLink>
      ))}
    </>
  );
}
export default SocialLinks;
