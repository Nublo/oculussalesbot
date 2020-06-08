CREATE TABLE last_update (
  id INT PRIMARY KEY,
  update_id varchar(32) -- latest posted sale
);

CREATE table sales (
	id varchar(32) PRIMARY KEY, -- same as update_id, unique string to represent sale
	title varchar(500), -- title of post
	link varchar(500), -- link to the game
	sale_end_date timestamp DEFAULT null,
	message_id INT-- telegram message_id to refer to the post later
);