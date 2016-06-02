require "mysql2"
require File.expand_path(File.dirname(__FILE__) + "/base.rb")
require 'htmlentities'

class ImportScripts::MosfigSQL < ImportScripts::Base

  DB_NAME = "gmail_import"
  DB_HOST = "10.0.2.2" # mysql running on host in vagrant env
  DB_USER = "gmail_importer"
  USER_TABLE = "subscribers"
  TOPIC_TABLE = "threads"
  POSTS_TABLE = "google_messages"
  ATTACHMENTS_BASE_DIR = nil # "/absolute/path/to/attachments" set the absolute path if you have attachments
  BATCH_SIZE = 1000
  CONVERT_HTML = true
  CATEGORY_ID = 6

  def initialize
    super
    @htmlentities = HTMLEntities.new
    @client = Mysql2::Client.new(
      host: DB_HOST,
      username: DB_USER,
      # password: "pa$$word",
      database: DB_NAME
    )
  end

  def execute
    import_users
    #import_topics
    #import_posts
  end

  def import_users
    puts '', "importing users"

    total_count = mysql_query("SELECT count(*) count FROM #{USER_TABLE};").first['count']

    batches(BATCH_SIZE) do |offset|
      results = mysql_query(
        "SELECT subscriber_id, name, email_address
         FROM #{USER_TABLE}
         ORDER BY subscriber_id ASC
         LIMIT #{BATCH_SIZE}
         OFFSET #{offset};")

      break if results.size < 1

      next if all_records_exist? :users, results.map {|u| u['subscriber_id'].to_i}

      create_users(results, total: total_count, offset: offset) do |user|
        { id: user['subscriber_id'],
          email: user['email_address'],
          name: user['name'],
          staged: true
        }
      end
    end
  end


  def import_topics
    puts "", "importing topics..."

    total_count = mysql_query("SELECT count(*) count FROM #{TOPIC_TABLE};").first['count']

    batches(BATCH_SIZE) do |offset|
      discussions = mysql_query(
        "SELECT DiscussionID, CategoryID, Name, Body,
                DateInserted, InsertUserID
         FROM #{TABLE_PREFIX}Discussion
         ORDER BY DiscussionID ASC
         LIMIT #{BATCH_SIZE}
         OFFSET #{offset};")

      break if discussions.size < 1
      next if all_records_exist? :posts, discussions.map {|t| "discussion#" + t['DiscussionID'].to_s}

      create_posts(discussions, total: total_count, offset: offset) do |discussion|
        {
          id: "discussion#" + discussion['DiscussionID'].to_s,
          user_id: user_id_from_imported_user_id(discussion['InsertUserID']) || Discourse::SYSTEM_USER_ID,
          title: discussion['Name'],
          category: category_id_from_imported_category_id(discussion['CategoryID']),
          raw: clean_up(discussion['Body']),
          created_at: Time.zone.at(discussion['DateInserted'])
        }
      end
    end
  end

  def import_posts
    puts "", "importing posts..."

    total_count = mysql_query("SELECT count(*) count FROM #{TABLE_PREFIX}Comment;").first['count']

    batches(BATCH_SIZE) do |offset|
      comments = mysql_query(
        "SELECT CommentID, DiscussionID, Body,
                DateInserted, InsertUserID
         FROM #{TABLE_PREFIX}Comment
         ORDER BY CommentID ASC
         LIMIT #{BATCH_SIZE}
         OFFSET #{offset};")

      break if comments.size < 1
      next if all_records_exist? :posts, comments.map {|comment| "comment#" + comment['CommentID'].to_s}

      create_posts(comments, total: total_count, offset: offset) do |comment|
        next unless t = topic_lookup_from_imported_post_id("discussion#" + comment['DiscussionID'].to_s)
        next if comment['Body'].blank?
        {
          id: "comment#" + comment['CommentID'].to_s,
          user_id: user_id_from_imported_user_id(comment['InsertUserID']) || Discourse::SYSTEM_USER_ID,
          topic_id: t[:topic_id],
          raw: clean_up(comment['Body']),
          created_at: Time.zone.at(comment['DateInserted'])
        }
      end
    end
  end

  def clean_up(raw)
    return "" if raw.blank?

    # decode HTML entities
    raw = @htmlentities.decode(raw)

    # fix whitespaces
    raw = raw.gsub(/(\\r)?\\n/, "\n")
             .gsub("\\t", "\t")

    # [HTML]...[/HTML]
    raw = raw.gsub(/\[html\]/i, "\n```html\n")
             .gsub(/\[\/html\]/i, "\n```\n")

    # [PHP]...[/PHP]
    raw = raw.gsub(/\[php\]/i, "\n```php\n")
             .gsub(/\[\/php\]/i, "\n```\n")

    # [HIGHLIGHT="..."]
    raw = raw.gsub(/\[highlight="?(\w+)"?\]/i) { "\n```#{$1.downcase}\n" }

    # [CODE]...[/CODE]
    # [HIGHLIGHT]...[/HIGHLIGHT]
    raw = raw.gsub(/\[\/?code\]/i, "\n```\n")
             .gsub(/\[\/?highlight\]/i, "\n```\n")

    # [SAMP]...[/SAMP]
    raw.gsub!(/\[\/?samp\]/i, "`")

    unless CONVERT_HTML
      # replace all chevrons with HTML entities
      # NOTE: must be done
      #  - AFTER all the "code" processing
      #  - BEFORE the "quote" processing
      raw = raw.gsub(/`([^`]+)`/im) { "`" + $1.gsub("<", "\u2603") + "`" }
               .gsub("<", "&lt;")
               .gsub("\u2603", "<")

      raw = raw.gsub(/`([^`]+)`/im) { "`" + $1.gsub(">", "\u2603") + "`" }
               .gsub(">", "&gt;")
               .gsub("\u2603", ">")
    end

    # [URL=...]...[/URL]
    raw.gsub!(/\[url="?(.+?)"?\](.+)\[\/url\]/i) { "[#{$2}](#{$1})" }

    # [IMG]...[/IMG]
    raw.gsub!(/\[\/?img\]/i, "")

    # [URL]...[/URL]
    # [MP3]...[/MP3]
    raw = raw.gsub(/\[\/?url\]/i, "")
             .gsub(/\[\/?mp3\]/i, "")

    # [QUOTE]...[/QUOTE]
    raw.gsub!(/\[quote\](.+?)\[\/quote\]/im) { "\n> #{$1}\n" }

    # [YOUTUBE]<id>[/YOUTUBE]
    raw.gsub!(/\[youtube\](.+?)\[\/youtube\]/i) { "\nhttps://www.youtube.com/watch?v=#{$1}\n" }

    # [youtube=425,350]id[/youtube]
    raw.gsub!(/\[youtube="?(.+?)"?\](.+)\[\/youtube\]/i) { "\nhttps://www.youtube.com/watch?v=#{$2}\n" }

    # [MEDIA=youtube]id[/MEDIA]
    raw.gsub!(/\[MEDIA=youtube\](.+?)\[\/MEDIA\]/i) { "\nhttps://www.youtube.com/watch?v=#{$1}\n" }

    # [VIDEO=youtube;<id>]...[/VIDEO]
    raw.gsub!(/\[video=youtube;([^\]]+)\].*?\[\/video\]/i) { "\nhttps://www.youtube.com/watch?v=#{$1}\n" }

    # Convert image bbcode
    raw.gsub!(/\[img=(\d+),(\d+)\]([^\]]*)\[\/img\]/i, '<img width="\1" height="\2" src="\3">')

    # Remove the color tag
    raw.gsub!(/\[color=[#a-z0-9]+\]/i, "")
    raw.gsub!(/\[\/color\]/i, "")

    # remove attachments
    raw.gsub!(/\[attach[^\]]*\]\d+\[\/attach\]/i, "")

    # sanitize img tags
    raw.gsub!(/\<img.*src\="([^\"]+)\".*\>/i) {"\n<img src='#{$1}'>\n"}

    raw
  end

  def mysql_query(sql)
    @client.query(sql)
    # @client.query(sql, cache_rows: false) #segfault: cache_rows: false causes segmentation fault
  end

end

ImportScripts::MosfigSQL.new.perform
