FROM ubuntu:24.04

RUN apt-get update
RUN apt-get upgrade -y

RUN apt-get install -y sudo openssh-server
RUN echo 'Defaults visiblepw'             >> /etc/sudoers
RUN echo 'ubuntu ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers
# RUN useradd -m -s /bin/bash -G sudo ubuntu
RUN mkdir /var/run/sshd
RUN echo 'ubuntu:sdflkjseflij234098' | chpasswd
RUN service ssh start && service ssh stop

RUN apt-get install -y nodejs npm
WORKDIR /data/sxcbot
RUN npm init -y
RUN npm install typescript ts-node @types/node node-fetch dotenv nostr-tools --save-dev
RUN npm install @google-cloud/vertexai --save-dev
RUN npm install openai --save-dev

RUN apt-get install -y screen

USER root

CMD ["/usr/sbin/sshd", "-D"]