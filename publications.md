---
layout: default
permalink: /publications/
visibility: 'All'
---

## Publications

You can also download my <a href="../assets/jdanish_webcv.pdf" target="_blank">CV as a PDF</a>.


{% include filter_setup.html %}


{% comment %} Get the set to group by year, then for each year grab the list of pubs to generate a bullet for each. {% endcomment %}
{% assign citations = site.data.rapt_web_data.publications |  sort: "date" | reverse | group_by: "date"  %}
<ul class="pubs">
{% for citation in citations %}


<h2>{{citation.name}}</h2> 

  {% assign itemsSorted = citation.items | sort: "citation"%}
  {% for item in itemsSorted %}

    {% comment %} Slightly clunky, but basically, project pubs should only be visible if the page vis is project, and lab pubs if it is Lab, so lab or project only is hidden on "all" which is my website {% endcomment %} 


    {% if page.visibility == 'All' and item.visibility == 'Project' or  item.visibility == 'Lab'  %}    
      {% continue %}
    {% endif %}

    {% if page.visibility == 'Lab' and item.visibility == 'Project' %}    
        {% continue %}
    {% endif %}

    <li class="pub-item" data-type="{{ item.type }}">
      {{item.citation}}      
      
        {% for link in item.links %}
          {% if link.url %}<a href="{{link.url}}" target="_blank"><i class="fa-regular fa-file-lines"></i>{{link.linklabel}}</a> {% endif %}
        {% endfor %}

        {% assign project_infos = site.data.rapt_web_data.projects | where: "name", item.project %}

        {% for project_info in project_infos %}
          {% if project_info.more %}<a href="{{project_info.more}}"><i class="fa-solid fa-dna"></i>{{project_info.name}} project info</a> {% endif %}
          {% if project_info.url %}<a href="{{project_info.url}}" target="_blank"><i class="fa-solid fa-arrow-up-right-from-square"></i>{{project_info.name}} website</a> {% endif %}
        {% endfor %}

        {% comment %} This would be cleaner with a where_exp or two arrays concat but neither seems to work on GitHub yet {% endcomment %}

        {% if item.secondaryProject  %}
          {% assign project_infos = site.data.rapt_web_data.projects | where: "name", item.secondaryProject %}

          {% for project_info in project_infos %}
            {% if project_info.more %}<a href="{{project_info.more}}"><i class="fa-solid fa-dna"></i>{{project_info.name}} project info</a>{% endif %}
            {% if project_info.url %}<a href="{{project_info.url}}" target="_blank"><i class="fa-solid fa-arrow-up-right-from-square"></i>{{project_info.name}} website</a>{% endif %}
          {% endfor %}
        {% endif %}
    </li>
  
  {% endfor %}

{% endfor %}
<br>
<strong>NOTE</strong>: Additional publications are currently being imported so if there is something you expect don't see but are curious about please contact JDanish [@] iu.edu.

