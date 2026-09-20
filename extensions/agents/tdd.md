---
name: tdd
description: Execute one implementation ticket using the tdd skill.
autoloadSkills: ["tdd"]
blocking: true
model: deepseek/deepseek-flash:high
---
Execute the single ticket supplied in this task.

The auto-loaded tdd skill owns the execution procedure, verification requirements, completion criteria, and final report. Follow it.

Keep ticket scope isolated: do not read or modify other ticket files. Read and change the project files needed to deliver the assigned ticket.
