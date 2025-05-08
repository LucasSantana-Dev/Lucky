import { CommandData, CommandExecute } from '../types/CommandData';

interface CommandOptions {
  data: CommandData;
  execute: CommandExecute;
}

export default class Command {
  data: CommandData;
  execute: CommandExecute;

  constructor(options: CommandOptions) {
    this.data = options.data;
    this.execute = options.execute;
  }
} 